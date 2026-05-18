import { describe, expect, it } from "vitest";

import type { CapturedScreenshot } from "../types.ts";

import { resolveElementId, resolveUrl } from "../upload.ts";

describe("upload URL resolution", () => {
  it("should resolve relative URLs from proxied storage", () => {
    const relativeUrl = "/api/storage/upload/abc-123";
    const apiUrl = "http://localhost:3000";
    expect(resolveUrl(relativeUrl, apiUrl)).toBe(
      "http://localhost:3000/api/storage/upload/abc-123",
    );
  });

  it("should pass through absolute URLs unchanged", () => {
    const absoluteUrl = "https://s3.amazonaws.com/bucket/key?presigned=true";
    expect(resolveUrl(absoluteUrl, "http://localhost:3000")).toBe(absoluteUrl);
  });

  it("should handle apiUrl with trailing path", () => {
    const relativeUrl = "/api/storage/upload/def-456";
    const apiUrl = "https://cat.example.com";
    expect(resolveUrl(relativeUrl, apiUrl)).toBe(
      "https://cat.example.com/api/storage/upload/def-456",
    );
  });
});

describe("screenshot deduplication by filePath", () => {
  it("should group screenshots by filePath", () => {
    const screenshots: CapturedScreenshot[] = [
      {
        filePath: "/tmp/shot1.png",
        element: {
          ref: "el-1",
          stableSourceRef: "el-1",
          sourceNodeRef: "",
          text: "Hello",
          languageId: "",
          meta: {
            framework: "vue-i18n",
            file: "a.vue",
            callSite: "template:L1:C1",
          },
        },
        highlightRegion: { x: 10, y: 20, width: 100, height: 30 },
      },
      {
        filePath: "/tmp/shot1.png",
        element: {
          ref: "el-2",
          stableSourceRef: "el-2",
          sourceNodeRef: "",
          text: "Hello",
          languageId: "",
          meta: {
            framework: "vue-i18n",
            file: "b.vue",
            callSite: "template:L5:C1",
          },
        },
        highlightRegion: { x: 10, y: 20, width: 100, height: 30 },
      },
    ];

    const uniqueFiles = new Map<string, CapturedScreenshot[]>();
    for (const s of screenshots) {
      const list = uniqueFiles.get(s.filePath) ?? [];
      list.push(s);
      uniqueFiles.set(s.filePath, list);
    }

    expect(uniqueFiles.size).toBe(1);
    expect(uniqueFiles.get("/tmp/shot1.png")?.length).toBe(2);
  });

  it("should handle empty screenshot list", () => {
    const screenshots: CapturedScreenshot[] = [];
    const uniqueFiles = new Map<string, CapturedScreenshot[]>();
    for (const s of screenshots) {
      const list = uniqueFiles.get(s.filePath) ?? [];
      list.push(s);
      uniqueFiles.set(s.filePath, list);
    }
    expect(uniqueFiles.size).toBe(0);
  });
});

describe("resolveElementId", () => {
  it("resolves numeric element IDs from seeder bindings", () => {
    expect(
      resolveElementId("vue-i18n:src/App.vue:template:L1", {
        "element:vue-i18n:src/App.vue:template:L1": "42",
      }),
    ).toBe(42);
  });

  it("throws when the binding is missing", () => {
    expect(() => resolveElementId("missing", {})).toThrow(
      /Missing element binding/,
    );
  });

  it("throws when the binding is not numeric", () => {
    expect(() =>
      resolveElementId("bad", { "element:bad": "not-a-number" }),
    ).toThrow(/not numeric/);
  });
});
