import { describe, expect, it } from "vitest";

import { getPackageDocSlug, getPackageDocHref } from "./package-doc-path.js";

describe("package doc path helpers", () => {
  it("creates a generic slug when no stripPrefix is configured", () => {
    expect(getPackageDocSlug("@acme/domain", {})).toBe("acme--domain");
    expect(getPackageDocHref("@acme/domain", {})).toBe(
      "./packages/acme--domain.md",
    );
  });

  it("preserves current CAT filenames when stripPrefix is configured", () => {
    expect(getPackageDocSlug("@cat/domain", { stripPrefix: "@cat/" })).toBe(
      "domain",
    );
    expect(getPackageDocHref("@cat/domain", { stripPrefix: "@cat/" })).toBe(
      "./packages/domain.md",
    );
  });
});
