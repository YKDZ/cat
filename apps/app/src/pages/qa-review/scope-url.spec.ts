import { describe, expect, it } from "vitest";

import {
  buildQaReviewHref,
  parseQaReviewElementTarget,
  parseQaReviewElementTargetFromPathname,
  parseQaReviewScopeFromRoute,
  resolveQaReviewElementTarget,
} from "./scope-url.ts";

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

  it("parses element route targets from params and pathnames", () => {
    expect(parseQaReviewElementTarget("42")).toBe(42);
    expect(parseQaReviewElementTarget("empty")).toBe("empty");
    expect(parseQaReviewElementTarget("auto")).toBe("auto");
    expect(parseQaReviewElementTarget("0")).toBe("auto");
    expect(
      parseQaReviewElementTargetFromPathname(
        "/qa-review/project/11111111-1111-4111-8111-111111111111/zh-Hans/42",
      ),
    ).toBe(42);
  });

  it("uses the browser pathname when cold hydration still exposes the auto route context", () => {
    expect(
      resolveQaReviewElementTarget({
        browserPathname:
          "/qa-review/project/11111111-1111-4111-8111-111111111111/zh-Hans/21",
        contextPathname:
          "/qa-review/project/11111111-1111-4111-8111-111111111111/zh-Hans/auto",
        routeParam: "auto",
      }),
    ).toBe(21);
  });
});
