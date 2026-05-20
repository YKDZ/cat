import { describe, expect, it } from "vitest";

import {
  EditorElementQuerySchema,
  EditorScopeSchema,
  ElementSortModeValues,
  OperationScopeSchema,
  EditorTranslationStatusFilterValues,
} from "../editor.ts";

const projectId = "11111111-1111-4111-8111-111111111111";
const nodeId = "22222222-2222-4222-8222-222222222222";

describe("editor scope schemas", () => {
  it("normalizes a full-project editor scope", () => {
    const scope = EditorScopeSchema.parse({
      projectId,
      languageToId: "zh-Hans",
    });

    expect(scope).toMatchObject({
      projectId,
      languageToId: "zh-Hans",
      contentNodeIds: [],
      searchQuery: "",
      statusFilter: "all",
      sortMode: "structure",
      page: 1,
      pageSize: 16,
    });
  });

  it("accepts content-node filters and every supported status filter", () => {
    for (const statusFilter of EditorTranslationStatusFilterValues) {
      const scope = EditorScopeSchema.parse({
        projectId,
        languageToId: "fr",
        contentNodeIds: [nodeId],
        statusFilter,
      });

      expect(scope.statusFilter).toBe(statusFilter);
      expect(scope.contentNodeIds).toEqual([nodeId]);
    }
  });

  it("normalizes element sort mode across editor and operation scopes", () => {
    for (const sortMode of ElementSortModeValues) {
      const editorScope = EditorScopeSchema.parse({
        projectId,
        languageToId: "fr",
        sortMode,
      });
      const operationScope = OperationScopeSchema.parse({
        projectId,
        sortMode,
      });

      expect(editorScope.sortMode).toBe(sortMode);
      expect(operationScope.sortMode).toBe(sortMode);
    }
  });

  it("rejects unknown element sort modes", () => {
    expect(() =>
      EditorScopeSchema.parse({
        projectId,
        languageToId: "ja",
        sortMode: "nearest-first",
      }),
    ).toThrow();
  });

  it("uses zero-based pages for backend element queries", () => {
    const query = EditorElementQuerySchema.parse({
      projectId,
      languageToId: "de",
      page: 0,
    });

    expect(query.page).toBe(0);
    expect(query.pageSize).toBe(16);
  });
});
