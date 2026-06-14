import type { DbHandle } from "@cat/domain";
import type { JSONType } from "@cat/shared";

import {
  executeQuery,
  getContentNode,
  getContentRelation,
  getContextEvidence,
  getVectorizedString,
  getTranslatableElementRow,
  listTranslationsByIds,
} from "@cat/domain";

import type { ApplicationMethodRegistry } from "./application-method-registry.ts";
import type { EntityStateFetcher } from "./methods/simple-application-method.ts";

import { EditorOverlayTranslationStateSchema } from "./editor-overlay-payload.ts";
import { SimpleApplicationMethod } from "./methods/simple-application-method.ts";
import { VectorizedStringApplicationMethod } from "./methods/vectorized-string-application-method.ts";

/**
 * Safely serialize a DB row (which may contain Date etc.) to JSONType.
 */
function rowToJSON(value: unknown): JSONType {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return JSON.parse(JSON.stringify(value)) as JSONType;
}

const toTimestampString = (value: unknown, fallback: string): string => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return fallback;
};

/**
 * 在服务器启动时调用一次，使 rebase before-重写可以查询实际数据库表。
 * Inject EntityStateFetcher into each method in the registry.
 * Called once at server startup so rebase before-rewrite can query actual DB tables.
 */
export function wireEntityStateFetchers(
  registry: ApplicationMethodRegistry,
  db: DbHandle,
): void {
  function setFetcher(entityType: string, fetcher: EntityStateFetcher): void {
    if (!registry.has(entityType)) return;
    const method = registry.get(entityType);
    if (
      method instanceof SimpleApplicationMethod ||
      method instanceof VectorizedStringApplicationMethod
    ) {
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
      const elementId = Number.parseInt(entityId, 10);
      if (!Number.isInteger(elementId)) return null;

      const row = await executeQuery({ db }, getTranslatableElementRow, {
        elementId,
      });
      return row ? rowToJSON(row) : null;
    },
    async fetchMany(entityIds, _ctx) {
      const results = new Map<string, JSONType>();
      await Promise.all(
        entityIds.map(async (id) => {
          const elementId = Number.parseInt(id, 10);
          if (!Number.isInteger(elementId)) return;

          const row = await executeQuery({ db }, getTranslatableElementRow, {
            elementId,
          });
          if (row !== null) results.set(id, rowToJSON(row));
        }),
      );
      return results;
    },
  };

  const fetchTranslationState = async (
    entityId: string,
  ): Promise<JSONType | null> => {
    const translationId = Number.parseInt(entityId, 10);
    if (!Number.isInteger(translationId)) return null;

    const translations = await executeQuery({ db }, listTranslationsByIds, {
      translationIds: [translationId],
    });
    const row = translations[0];
    if (!row) return null;

    const stringIdValue = Reflect.get(row, "stringId");
    if (typeof stringIdValue !== "number") return null;

    const stringRow = await executeQuery({ db }, getVectorizedString, {
      stringId: stringIdValue,
    });
    if (!stringRow) return null;

    const elementRow = await executeQuery({ db }, getTranslatableElementRow, {
      elementId: row.translatableElementId,
    });
    if (!elementRow) return null;

    const updatedAtValue = Reflect.get(row, "updatedAt");
    const createdAt = toTimestampString(
      row.createdAt,
      new Date(0).toISOString(),
    );
    const updatedAt = toTimestampString(updatedAtValue, createdAt);

    return rowToJSON(
      EditorOverlayTranslationStateSchema.parse({
        translatableElementId: row.translatableElementId,
        languageId: stringRow.languageId,
        text: row.text,
        translatorId: row.translatorId,
        approved: elementRow.approvedTranslationId === translationId,
        createdAt,
        updatedAt,
      }),
    );
  };

  const translationStateFetcher: EntityStateFetcher = {
    async fetchOne(entityId, _ctx) {
      return await fetchTranslationState(entityId);
    },
    async fetchMany(entityIds, _ctx) {
      const results = new Map<string, JSONType>();
      await Promise.all(
        entityIds.map(async (id) => {
          const state = await fetchTranslationState(id);
          if (state !== null) results.set(id, state);
        }),
      );
      return results;
    },
  };

  setFetcher("content_node", contentNodeFetcher);
  setFetcher("content_relation", contentRelationFetcher);
  setFetcher("context_evidence", contextEvidenceFetcher);
  setFetcher("element", elementFetcher);
  setFetcher("translation", translationStateFetcher);
}
