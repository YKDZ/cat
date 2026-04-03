import { describe, expect, test } from "vitest";

import { SpacyWordSegmenter } from "./segmenter";

describe("SpacyWordSegmenter", () => {
  test("accepts serverUrl provided by runtime config", () => {
    const segmenter = new SpacyWordSegmenter({
      serverUrl: "http://localhost:8000",
    });

    expect(segmenter.getId()).toBe("spacy-word-segmenter");
  });

  test("requires serverUrl to exist in runtime config", () => {
    expect(() => new SpacyWordSegmenter({})).toThrow();
  });
});
