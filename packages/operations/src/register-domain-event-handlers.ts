import type { DrizzleClient } from "@cat/domain";
import type { PluginManager } from "@cat/plugin-core";

import {
  closeIssue,
  domainEventBus,
  executeCommand,
  executeQuery,
  getCommentRecipient,
  type DomainEventMap,
} from "@cat/domain";
import { sendMessage } from "@cat/message";
import { getPermissionEngine } from "@cat/permissions";
import { serverLogger as logger } from "@cat/server-shared";

import { runAutoTranslatePipeline } from "./run-auto-translate-pipeline";
import { triggerConceptRevectorize } from "./trigger-revectorize";
import { triggerTermRecallReindex } from "./trigger-term-recall-reindex";

let registered = false;

const onConceptUpdated = async (
  payload: DomainEventMap["concept:updated"],
  pluginManager?: PluginManager,
): Promise<void> => {
  const ctx = {
    traceId: `domain-event:concept-updated:${payload.conceptId}`,
    pluginManager,
  };

  triggerConceptRevectorize(payload.conceptId, ctx);
  triggerTermRecallReindex(payload.conceptId, ctx);
};

const onProjectCreated = async (
  payload: DomainEventMap["project:created"],
): Promise<void> => {
  const engine = getPermissionEngine();
  await engine.grant({ type: "user", id: payload.creatorId }, "owner", {
    type: "project",
    id: payload.projectId,
  });
};

const onGlossaryCreated = async (
  payload: DomainEventMap["glossary:created"],
): Promise<void> => {
  const engine = getPermissionEngine();
  await engine.grant({ type: "user", id: payload.creatorId }, "owner", {
    type: "glossary",
    id: payload.glossaryId,
  });
};

const onMemoryCreated = async (
  payload: DomainEventMap["memory:created"],
): Promise<void> => {
  const engine = getPermissionEngine();
  await engine.grant({ type: "user", id: payload.creatorId }, "owner", {
    type: "memory",
    id: payload.memoryId,
  });
};

/**
 * @zh 注册领域事件处理器（全局单例）。
 *
 * 订阅以下领域事件：
 * - `concept:updated` → 触发概念重向量化
 * - `project:created` → 授予创建者 owner 权限
 * - `glossary:created` → 授予创建者 owner 权限
 * - `memory:created` → 授予创建者 owner 权限
 * - `comment:created` → 向翻译作者发送评论通知
 * - `pr:merged` → 如关联 Issue 则自动关闭 Issue
 *
 * 具备内置幂等性防护，重复调用不会重复注册。
 * @en Register domain event handlers (global singleton).
 *
 * Subscribes to the following domain events:
 * - `concept:updated` → triggers concept re-vectorization
 * - `project:created` → grants owner permission to the creator
 * - `glossary:created` → grants owner permission to the creator
 * - `memory:created` → grants owner permission to the creator
 * - `comment:created` → notifies the translation author of new comment
 * - `pr:merged` → auto-closes linked issue if present
 *
 * Idempotent: repeated calls are no-ops.
 */
export const registerDomainEventHandlers = (
  db: DrizzleClient,
  options?: { pluginManager?: PluginManager },
): void => {
  if (registered) {
    return;
  }

  domainEventBus.subscribe("concept:updated", async (event) => {
    try {
      await onConceptUpdated(event.payload, options?.pluginManager);
    } catch (error) {
      logger
        .withSituation("SERVER")
        .error(error, "Failed to handle concept:updated event");
    }
  });

  domainEventBus.subscribe("project:created", async (event) => {
    try {
      await onProjectCreated(event.payload);
    } catch (error) {
      logger
        .withSituation("SERVER")
        .error(error, "Failed to handle project:created event");
    }
  });

  domainEventBus.subscribe("glossary:created", async (event) => {
    try {
      await onGlossaryCreated(event.payload);
    } catch (error) {
      logger
        .withSituation("SERVER")
        .error(error, "Failed to handle glossary:created event");
    }
  });

  domainEventBus.subscribe("memory:created", async (event) => {
    try {
      await onMemoryCreated(event.payload);
    } catch (error) {
      logger
        .withSituation("SERVER")
        .error(error, "Failed to handle memory:created event");
    }
  });

  domainEventBus.subscribe("comment:created", async (event) => {
    try {
      const result = await executeQuery({ db }, getCommentRecipient, {
        commentId: event.payload.commentId,
      });
      if (!result) return;

      await sendMessage({
        recipientId: result.recipientId,
        category: "COMMENT_REPLY",
        title: "你收到了一条新评论", // @i18n-key
        body: "有人在你的翻译上留下了评论", // @i18n-key
        data: { commentId: event.payload.commentId },
      });
    } catch (error) {
      logger
        .withSituation("SERVER")
        .error(error, "Failed to handle comment:created event");
    }
  });

  domainEventBus.subscribe("issue:closed", async (event) => {
    try {
      logger
        .withSituation("SERVER")
        .info(
          `Issue ${event.payload.issueId} closed${event.payload.closedByPRId ? ` by PR ${event.payload.closedByPRId}` : ""}`,
        );
    } catch (error) {
      logger
        .withSituation("SERVER")
        .error(error, "Failed to handle issue:closed event");
    }
  });

  domainEventBus.subscribe("pr:merged", async (event) => {
    try {
      const { issueId, prId } = event.payload;
      if (issueId !== undefined) {
        await executeCommand({ db }, closeIssue, {
          issueId,
          closedByPRId: prId,
        });
      }
    } catch (error) {
      logger
        .withSituation("SERVER")
        .error(error, "Failed to handle pr:merged event");
    }
  });

  domainEventBus.subscribe("element:created", (event) => {
    void runAutoTranslatePipeline(
      { db },
      {
        projectId: event.payload.projectId,
        documentId: event.payload.documentId,
        elementIds: event.payload.elementIds,
      },
    ).catch((error: unknown) => {
      logger
        .withSituation("SERVER")
        .error(error, "Auto-translate pipeline failed for element:created");
    });
  });

  registered = true;
};
