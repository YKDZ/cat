import { describe, expect, it } from "vitest";

import { releaseImageTags } from "./release-image-tags.ts";

const revision = "0123456789abcdef0123456789abcdef01234567";

describe("release image tag contract", () => {
  it("keeps normal tags on standalone and marks every runtime tag", () => {
    expect(
      releaseImageTags("ghcr.io/acme/cat", "1.2.3", revision, "standalone"),
    ).toEqual([
      "ghcr.io/acme/cat:1.2.3",
      "ghcr.io/acme/cat:sha-0123456789ab",
      "ghcr.io/acme/cat:latest",
    ]);
    expect(
      releaseImageTags("ghcr.io/acme/cat", "1.2.3", revision, "runtime"),
    ).toEqual([
      "ghcr.io/acme/cat:1.2.3-runtime",
      "ghcr.io/acme/cat:sha-0123456789ab-runtime",
      "ghcr.io/acme/cat:latest-runtime",
    ]);
  });

  it("normalizes the GitHub owner and repository for GHCR", () => {
    expect(
      releaseImageTags("ghcr.io/YKDZ/CAT", "1.2.3", revision, "standalone"),
    ).toEqual([
      "ghcr.io/ykdz/cat:1.2.3",
      "ghcr.io/ykdz/cat:sha-0123456789ab",
      "ghcr.io/ykdz/cat:latest",
    ]);
  });
});
