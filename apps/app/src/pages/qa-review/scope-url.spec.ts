import { describe, expect, it } from "vitest";

import { buildQaReviewHref, parseQaReviewScopeFromRoute } from "./scope-url";

describe("qa review scope url", () => {
  it("round-trips editor scope query parameters on qa-review routes", () => {
    const projectId = "11111111-1111-4111-8111-111111111111";
    const nodeId = "22222222-2222-4222-8222-222222222222";
    const scope = parseQaReviewScopeFromRoute({
      projectId,
      languageToId: "zh-Hans",
      searchParams: new URLSearchParams(
        `nodes=${nodeId}&q=needle&status=translated&sort=reuse-first&page=3&pageSize=32&branchId=7`,
      ),
    });

    expect(buildQaReviewHref(scope, 42)).toBe(
      `/qa-review/project/${projectId}/zh-Hans/42?nodes=${nodeId}&q=needle&status=translated&sort=reuse-first&page=3&pageSize=32&branchId=7`,
    );
  });
});
