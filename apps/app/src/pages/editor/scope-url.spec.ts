import { describe, expect, it } from "vitest";

import {
  buildEditorHref,
  parseEditorScopeFromRoute,
  toEditorSearchParams,
} from "./scope-url";

const projectId = "11111111-1111-4111-8111-111111111111";
const nodeA = "22222222-2222-4222-8222-222222222222";
const nodeB = "33333333-3333-4333-8333-333333333333";

describe("editor scope URLs", () => {
  it("builds a clean full-project URL", () => {
    expect(
      buildEditorHref(
        {
          projectId,
          languageToId: "zh-Hans",
          contentNodeIds: [],
          searchQuery: "",
          statusFilter: "all",
          sortMode: "structure",
          page: 1,
          pageSize: 16,
        },
        "auto",
      ),
    ).toBe(`/editor/project/${projectId}/zh-Hans/auto`);
  });

  it("round-trips filters, status, page, and branch", () => {
    const scope = parseEditorScopeFromRoute({
      projectId,
      languageToId: "fr",
      searchParams: new URLSearchParams(
        `nodes=${nodeA},${nodeB}&q=hello&status=untranslated&sort=reuse-first&page=3&pageSize=20&branchId=42`,
      ),
    });

    expect(scope.contentNodeIds).toEqual([nodeA, nodeB]);
    expect(scope.searchQuery).toBe("hello");
    expect(scope.statusFilter).toBe("untranslated");
    expect(scope.sortMode).toBe("reuse-first");
    expect(scope.page).toBe(3);
    expect(scope.pageSize).toBe(20);
    expect(scope.branchId).toBe(42);
    expect(toEditorSearchParams(scope).toString()).toBe(
      `nodes=${nodeA}%2C${nodeB}&q=hello&status=untranslated&sort=reuse-first&page=3&pageSize=20&branchId=42`,
    );
  });

  it("preserves scope when switching elements", () => {
    const href = buildEditorHref(
      {
        projectId,
        languageToId: "de",
        contentNodeIds: [nodeA],
        searchQuery: "menu",
        statusFilter: "translated",
        sortMode: "reuse-first",
        page: 2,
        pageSize: 16,
      },
      123,
    );

    expect(href).toBe(
      `/editor/project/${projectId}/de/123?nodes=${nodeA}&q=menu&status=translated&sort=reuse-first&page=2`,
    );
  });

  it("sanitizes invalid query values to safe defaults", () => {
    const scope = parseEditorScopeFromRoute({
      projectId,
      languageToId: "ja",
      searchParams: new URLSearchParams(
        `nodes=not-a-uuid,${nodeA}&q=keep-me&status=unknown&page=-5&pageSize=999999`,
      ),
    });

    expect(scope.contentNodeIds).toEqual([nodeA]);
    expect(scope.searchQuery).toBe("keep-me");
    expect(scope.statusFilter).toBe("all");
    expect(scope.sortMode).toBe("structure");
    expect(scope.page).toBe(1);
    expect(scope.pageSize).toBe(16);
  });
});
