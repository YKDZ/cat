import {
  createTranslations,
  createVectorizedStrings,
  executeCommand,
  executeQuery,
  listTranslationsByElement,
} from "@cat/domain";
import type { JSONObject, JSONType } from "@cat/shared";
import { assertFirstNonNullish } from "@cat/shared";

import type {
  ApplicationContext,
  ApplicationMethod,
  ApplicationResult,
  AsyncDependencySpec,
  ChangesetEntry,
  DependencyStatus,
} from "../application-method.ts";
import type { EntityStateFetcher } from "./simple-application-method.ts";

const VECTORIZATION_ASYNC_SPEC: AsyncDependencySpec = {
  description: "TranslatableString vectorization via pgvector",
  estimatedDuration: 5000,
  retryable: true,
  maxRetries: 3,
  cancellable: false,
  completionEvent: "vectorization.completed",
};

const VCS_ENTITY_ID_META_KEY = "__catVcsEntityId";

const isJsonObject = (value: JSONType | undefined): value is JSONObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasVcsEntityId = (
  value: JSONType | undefined,
  entityId: string,
): boolean => {
  if (!isJsonObject(value)) return false;
  return value[VCS_ENTITY_ID_META_KEY] === entityId;
};

/**
 * CREATE 操作返回 ASYNC_PENDING（后台向量化任务启动后完成）。
 * Phase 0b 中为存根实现。
 * Application method for entities requiring async vectorization.
 * CREATE returns ASYNC_PENDING. Stub implementation for Phase 0b.
 */
export class VectorizedStringApplicationMethod implements ApplicationMethod {
  readonly entityType: string;
  readonly asyncDependencySpec: AsyncDependencySpec = VECTORIZATION_ASYNC_SPEC;
  private fetcher: EntityStateFetcher | null;

  constructor(entityType: string, fetcher?: EntityStateFetcher) {
    this.entityType = entityType;
    this.fetcher = fetcher ?? null;
  }

  private async applyTranslationCreate(
    entry: ChangesetEntry,
    ctx: ApplicationContext,
  ): Promise<ApplicationResult> {
    if (ctx.db === undefined) {
      return {
        status: "FAILED",
        errorMessage:
          "Translation application requires db in ApplicationContext",
      };
    }

    const payload = entry.after;
    if (
      typeof payload !== "object" ||
      payload === null ||
      Array.isArray(payload)
    ) {
      return {
        status: "FAILED",
        errorMessage: `Invalid translation payload for entry ${entry.id}`,
      };
    }

    const elementId = payload.translatableElementId;
    const languageId = payload.languageId;
    const text = payload.text;
    const translatorId = payload.translatorId;
    if (
      typeof elementId !== "number" ||
      !Number.isInteger(elementId) ||
      typeof languageId !== "string" ||
      typeof text !== "string"
    ) {
      return {
        status: "FAILED",
        errorMessage: `Invalid translation payload for entry ${entry.id}`,
      };
    }

    const existingTranslations = await executeQuery(
      {
        db: ctx.db,
        ...(ctx.collector === undefined ? {} : { collector: ctx.collector }),
      },
      listTranslationsByElement,
      { elementId, languageId },
    );
    if (
      existingTranslations.some((translation) =>
        hasVcsEntityId(translation.meta ?? undefined, entry.entityId),
      )
    ) {
      return { status: "APPLIED" };
    }

    const stringIds = await executeCommand(
      { db: ctx.db },
      createVectorizedStrings,
      {
        data: [{ text, languageId }],
      },
    );
    const stringId = assertFirstNonNullish(stringIds);
    await executeCommand(
      {
        db: ctx.db,
        ...(ctx.collector === undefined ? {} : { collector: ctx.collector }),
      },
      createTranslations,
      {
        data: [
          {
            translatableElementId: elementId,
            stringId,
            meta: {
              ...(isJsonObject(payload.meta) ? payload.meta : {}),
              [VCS_ENTITY_ID_META_KEY]: entry.entityId,
            },
            ...(typeof translatorId === "string" || translatorId === null
              ? { translatorId }
              : {}),
          },
        ],
      },
    );
    return { status: "APPLIED" };
  }

  async applyCreate(
    entry: ChangesetEntry,
    ctx: ApplicationContext,
  ): Promise<ApplicationResult> {
    if (this.entityType === "translation") {
      return await this.applyTranslationCreate(entry, ctx);
    }
    // In a real implementation, this would enqueue a vectorization job and
    // return the task ID. Phase 0b stub returns ASYNC_PENDING.
    return {
      status: "ASYNC_PENDING",
      asyncTaskId: `vect-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    };
  }

  async applyUpdate(
    _entry: ChangesetEntry,
    _ctx: ApplicationContext,
  ): Promise<ApplicationResult> {
    return {
      status: "ASYNC_PENDING",
      asyncTaskId: `vect-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    };
  }

  async applyDelete(
    _entry: ChangesetEntry,
    _ctx: ApplicationContext,
  ): Promise<ApplicationResult> {
    // Deletion is synchronous — vector index entry is removed directly
    return { status: "APPLIED" };
  }

  async applyRollback(
    _entry: ChangesetEntry,
    _ctx: ApplicationContext,
  ): Promise<ApplicationResult> {
    return {
      status: "ASYNC_PENDING",
      asyncTaskId: `vect-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    };
  }

  async validateDependencies(_entityId: string): Promise<DependencyStatus> {
    // In production: check if the vectorization task completed in the queue
    return { status: "READY" };
  }

  async compensate(
    _entry: ChangesetEntry,
    _ctx: ApplicationContext,
  ): Promise<void> {
    // Cancel or clean up any pending vectorization jobs
  }

  async fetchCurrentState(
    entityId: string,
    ctx: ApplicationContext,
  ): Promise<JSONType | null> {
    if (!this.fetcher) return null;
    return this.fetcher.fetchOne(entityId, ctx);
  }

  async fetchCurrentStates(
    entityIds: string[],
    ctx: ApplicationContext,
  ): Promise<Map<string, JSONType>> {
    if (!this.fetcher) return new Map();
    return this.fetcher.fetchMany(entityIds, ctx);
  }

  setFetcher(fetcher: EntityStateFetcher): void {
    this.fetcher = fetcher;
  }
}
