import { describe, expect, expectTypeOf, it } from "vitest";

import { parseE2ERefs, type E2ERefs } from "./e2e-refs.ts";

const completeRefs = {
  "content-node:elements": "content-node-id",
  glossary: "glossary-id",
  memory: "memory-id",
  project: "project-id",
  "user:admin": "admin-id",
};

describe("E2E refs contract", () => {
  it("preserves complete refs with precise required and dynamic types", () => {
    const refs = parseE2ERefs(completeRefs, "test refs");

    expect(refs).toEqual(completeRefs);
    expectTypeOf<E2ERefs["project"]>().toEqualTypeOf<string>();
    expectTypeOf<E2ERefs["scenario:dynamic"]>().toEqualTypeOf<
      string | undefined
    >();
  });

  it("rejects incomplete reusable seed refs", () => {
    for (const missingRef of ["glossary", "memory"] as const) {
      const refs = Object.fromEntries(
        Object.entries(completeRefs).filter(([ref]) => ref !== missingRef),
      );

      expect(() => parseE2ERefs(refs, "test refs")).toThrow(
        `Required ref "${missingRef}" not found in test refs.`,
      );
    }
  });
});
