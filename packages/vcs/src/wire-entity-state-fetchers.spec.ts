import type { DbHandle } from "@cat/domain";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApplicationContext } from "./application-method.ts";

const {
  executeQueryMock,
  getContentNodeMock,
  getContentRelationMock,
  getContextEvidenceMock,
  getTranslatableElementRowMock,
  getVectorizedStringMock,
  listTranslationsByIdsMock,
} = vi.hoisted(() => ({
  executeQueryMock: vi.fn(),
  getContentNodeMock: vi.fn(),
  getContentRelationMock: vi.fn(),
  getContextEvidenceMock: vi.fn(),
  getTranslatableElementRowMock: vi.fn(),
  getVectorizedStringMock: vi.fn(),
  listTranslationsByIdsMock: vi.fn(),
}));

vi.mock("@cat/domain", () => ({
  executeQuery: executeQueryMock,
  getContentNode: getContentNodeMock,
  getContentRelation: getContentRelationMock,
  getContextEvidence: getContextEvidenceMock,
  getTranslatableElementRow: getTranslatableElementRowMock,
  getVectorizedString: getVectorizedStringMock,
  listTranslationsByIds: listTranslationsByIdsMock,
}));

import {
  getTranslatableElementRow,
  getVectorizedString,
  listTranslationsByIds,
} from "@cat/domain";

import { ApplicationMethodRegistry } from "./application-method-registry.ts";
import { SimpleApplicationMethod } from "./methods/simple-application-method.ts";
import { VectorizedStringApplicationMethod } from "./methods/vectorized-string-application-method.ts";
import { wireEntityStateFetchers } from "./wire-entity-state-fetchers.ts";

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- executeQuery is mocked, so the db handle is never dereferenced in this unit test
const dbHandle = {} as DbHandle;
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- application methods only pass this context through to mocked fetchers in this unit test
const appContext = {} as ApplicationContext;

type MockExecuteInput = {
  elementId?: number;
  id?: string;
};

describe("wireEntityStateFetchers", () => {
  beforeEach(() => {
    executeQueryMock.mockReset();
  });

  it("wires fetchers for both simple and vectorized application methods", async () => {
    const registry = new ApplicationMethodRegistry();
    const contentNodeMethod = new SimpleApplicationMethod("content_node");
    const elementMethod = new VectorizedStringApplicationMethod("element");
    const translationMethod = new VectorizedStringApplicationMethod(
      "translation",
    );

    registry.register("content_node", contentNodeMethod);
    registry.register("element", elementMethod);
    registry.register("translation", translationMethod);

    executeQueryMock.mockImplementation(
      async (_ctx, query, input: MockExecuteInput) => {
        if (query === getTranslatableElementRow) {
          return {
            id: input.elementId,
            projectId: "11111111-1111-4111-8111-111111111111",
            importerId: "json-file-handler:JSON",
            sourceRootRef: "root",
            sourceNodeRef: "messages.json",
            stableSourceRef: "hello",
            identityStatus: "ACTIVE",
            identityConfidence: 10000,
            meta: null,
            sourceStartLine: null,
            sourceEndLine: null,
            sourceLocationMeta: null,
            creatorId: "22222222-2222-4222-8222-222222222222",
            vectorizedStringId: 5,
            approvedTranslationId: 11,
            createdAt: new Date("2024-01-01T00:00:00.000Z"),
            updatedAt: new Date("2024-01-01T00:00:00.000Z"),
          };
        }

        if (query === listTranslationsByIds) {
          return [
            {
              id: 11,
              translatableElementId: 7,
              translatorId: "22222222-2222-4222-8222-222222222222",
              stringId: 9,
              text: "你好",
              createdAt: new Date("2024-01-02T00:00:00.000Z"),
              updatedAt: new Date("2024-01-03T00:00:00.000Z"),
            },
          ];
        }

        if (query === getVectorizedString) {
          return {
            id: 9,
            languageId: "zh-Hans",
            value: "你好",
            createdAt: new Date("2024-01-02T00:00:00.000Z"),
            updatedAt: new Date("2024-01-02T00:00:00.000Z"),
          };
        }

        return {
          id: input.id,
          projectId: "11111111-1111-4111-8111-111111111111",
        };
      },
    );

    wireEntityStateFetchers(registry, dbHandle);

    const contentNodeState = await contentNodeMethod.fetchCurrentState(
      "node-1",
      appContext,
    );
    const elementState = await elementMethod.fetchCurrentState("7", appContext);
    const translationState = await translationMethod.fetchCurrentState(
      "11",
      appContext,
    );

    expect(contentNodeState).toMatchObject({ id: "node-1" });
    expect(elementState).toMatchObject({ id: 7, approvedTranslationId: 11 });
    expect(translationState).toMatchObject({
      translatableElementId: 7,
      languageId: "zh-Hans",
      text: "你好",
      approved: true,
    });
    expect(executeQueryMock).toHaveBeenCalledWith(
      { db: dbHandle },
      getTranslatableElementRow,
      { elementId: 7 },
    );
  });
});
