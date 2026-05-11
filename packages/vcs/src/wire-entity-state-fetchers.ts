import type { DbHandle } from "@cat/domain";
import type { JSONType } from "@cat/shared";

import {
  executeQuery,
  getContentNode,
  getContentRelation,
  getContextEvidence,
  getElementMeta,
} from "@cat/domain";

import type { ApplicationMethodRegistry } from "./application-method-registry.ts";
import type { EntityStateFetcher } from "./methods/simple-application-method.ts";

import { SimpleApplicationMethod } from "./methods/simple-application-method.ts";

/**
 * @zh 将 DB 行（可能包含 Date 等非 JSON 原生类型）安全序列化为 JSONType。
 * @en Safely serialize a DB row (which may contain Date etc.) to JSONType.
 */
function rowToJSON(value: unknown): JSONType {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return JSON.parse(JSON.stringify(value)) as JSONType;
}

/**
 * @zh 向 ApplicationMethodRegistry 中的每个 method 注入 EntityStateFetcher。
 * 在服务器启动时调用一次，使 rebase before-重写可以查询实际数据库表。
 * @en Inject EntityStateFetcher into each method in the registry.
 * Called once at server startup so rebase before-rewrite can query actual DB tables.
 */
export function wireEntityStateFetchers(
  registry: ApplicationMethodRegistry,
  db: DbHandle,
): void {
  function setFetcher(entityType: string, fetcher: EntityStateFetcher): void {
    if (!registry.has(entityType)) return;
    const method = registry.get(entityType);
    if (method instanceof SimpleApplicationMethod) {
      method.setFetcher(fetcher);
    }
  }

  const contentNodeFetcher: EntityStateFetcher = {
    async fetchOne(entityId, _ctx) {
      const row = await executeQuery({ db }, getContentNode, { id: entityId });
      return row ? rowToJSON(row) : null;
    },
    async fetchMany(entityIds, _ctx) {
      const results = new Map<string, JSONType>();
      await Promise.all(
        entityIds.map(async (id) => {
          const row = await executeQuery({ db }, getContentNode, { id });
          if (row) results.set(id, rowToJSON(row));
        }),
      );
      return results;
    },
  };

  const contentRelationFetcher: EntityStateFetcher = {
    async fetchOne(entityId, _ctx) {
      const row = await executeQuery({ db }, getContentRelation, {
        id: entityId,
      });
      return row ? rowToJSON(row) : null;
    },
    async fetchMany(entityIds, _ctx) {
      const results = new Map<string, JSONType>();
      await Promise.all(
        entityIds.map(async (id) => {
          const row = await executeQuery({ db }, getContentRelation, { id });
          if (row) results.set(id, rowToJSON(row));
        }),
      );
      return results;
    },
  };

  const contextEvidenceFetcher: EntityStateFetcher = {
    async fetchOne(entityId, _ctx) {
      const row = await executeQuery({ db }, getContextEvidence, {
        id: parseInt(entityId, 10),
      });
      return row ? rowToJSON(row) : null;
    },
    async fetchMany(entityIds, _ctx) {
      const results = new Map<string, JSONType>();
      await Promise.all(
        entityIds.map(async (id) => {
          const row = await executeQuery({ db }, getContextEvidence, {
            id: parseInt(id, 10),
          });
          if (row) results.set(id, rowToJSON(row));
        }),
      );
      return results;
    },
  };

  const elementFetcher: EntityStateFetcher = {
    async fetchOne(entityId, _ctx) {
      return executeQuery({ db }, getElementMeta, {
        elementId: parseInt(entityId, 10),
      });
    },
    async fetchMany(entityIds, _ctx) {
      const results = new Map<string, JSONType>();
      await Promise.all(
        entityIds.map(async (id) => {
          const meta = await executeQuery({ db }, getElementMeta, {
            elementId: parseInt(id, 10),
          });
          if (meta !== null) results.set(id, meta);
        }),
      );
      return results;
    },
  };

  setFetcher("content_node", contentNodeFetcher);
  setFetcher("content_relation", contentRelationFetcher);
  setFetcher("context_evidence", contextEvidenceFetcher);
  setFetcher("element", elementFetcher);
}
