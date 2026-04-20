import { describe, expect, it } from "vitest";

import {
  CaptureResultSchema,
  ExtractionResultSchema,
  NavigationStepSchema,
  RouteManifestSchema,
} from "../extraction.ts";

describe("ExtractionResultSchema", () => {
  it("parses a valid ExtractionResult with metadata", () => {
    const input = {
      elements: [
        {
          ref: "vue-i18n:app.vue:1:1",
          text: "你好",
          meta: { framework: "vue-i18n" },
        },
      ],
      contexts: [
        {
          elementRef: "vue-i18n:app.vue:1:1",
          type: "JSON",
          data: { json: { source: "app.vue" } },
        },
      ],
      metadata: {
        extractorIds: ["vue-i18n"],
        baseDir: "/home/user/project",
        timestamp: "2026-04-20T08:00:00.000Z",
      },
    };
    const result = ExtractionResultSchema.parse(input);
    expect(result.elements).toHaveLength(1);
    expect(result.contexts).toHaveLength(1);
    expect(result.metadata?.extractorIds).toEqual(["vue-i18n"]);
  });

  it("parses without metadata (optional)", () => {
    const input = { elements: [], contexts: [] };
    const result = ExtractionResultSchema.parse(input);
    expect(result.elements).toHaveLength(0);
    expect(result.metadata).toBeUndefined();
  });

  it("defaults contexts to empty array", () => {
    const input = { elements: [] };
    const result = ExtractionResultSchema.parse(input);
    expect(result.contexts).toEqual([]);
  });

  it("rejects invalid element (missing ref)", () => {
    const input = { elements: [{ text: "hi", meta: {} }], contexts: [] };
    expect(() => ExtractionResultSchema.parse(input)).toThrow();
  });
});

describe("NavigationStepSchema", () => {
  it("parses click step", () => {
    const result = NavigationStepSchema.parse({
      action: "click",
      selector: "#btn",
    });
    expect(result.action).toBe("click");
  });

  it("parses fill step", () => {
    const result = NavigationStepSchema.parse({
      action: "fill",
      selector: "#input",
      value: "test",
    });
    expect(result.action).toBe("fill");
  });

  it("parses wait step", () => {
    const result = NavigationStepSchema.parse({ action: "wait", ms: 500 });
    expect(result.action).toBe("wait");
  });

  it("rejects unknown action", () => {
    expect(() =>
      NavigationStepSchema.parse({ action: "hover", selector: "#x" }),
    ).toThrow();
  });
});

describe("RouteManifestSchema", () => {
  it("parses manifest with bindings", () => {
    const input = {
      routes: [
        { template: "/project/$ref:project" },
        {
          template: "/editor/$ref:document:elements/$ref:language:target/empty",
          waitAfterLoad: 2000,
        },
      ],
      bindings: {
        project: "a1b2c3d4-0000-0000-0000-000000000001",
        "document:elements": "42",
        "language:target": "67",
      },
    };
    const result = RouteManifestSchema.parse(input);
    expect(result.routes).toHaveLength(2);
    expect(result.bindings?.project).toBe(
      "a1b2c3d4-0000-0000-0000-000000000001",
    );
  });

  it("parses manifest without bindings", () => {
    const input = { routes: [{ template: "/" }] };
    const result = RouteManifestSchema.parse(input);
    expect(result.bindings).toBeUndefined();
  });

  it("parses route with steps and auth", () => {
    const input = {
      routes: [
        {
          template: "/login",
          auth: false,
          steps: [{ action: "fill", selector: "#email", value: "a@b.com" }],
        },
      ],
    };
    const result = RouteManifestSchema.parse(input);
    expect(result.routes[0].auth).toBe(false);
    expect(result.routes[0].steps).toHaveLength(1);
  });
});

describe("CaptureResultSchema", () => {
  it("parses a valid CaptureResult", () => {
    const input = {
      screenshots: [
        {
          filePath: "/tmp/shot.png",
          elementRef: "vue-i18n:app.vue:1:1",
          elementMeta: { framework: "vue-i18n" },
          route: "/project/abc",
          highlightRegion: { x: 10, y: 20, width: 100, height: 30 },
        },
      ],
      metadata: {
        baseUrl: "http://localhost:3000",
        timestamp: "2026-04-20T08:00:00.000Z",
      },
    };
    const result = CaptureResultSchema.parse(input);
    expect(result.screenshots).toHaveLength(1);
    expect(result.metadata?.baseUrl).toBe("http://localhost:3000");
  });

  it("parses without highlightRegion (optional)", () => {
    const input = {
      screenshots: [
        {
          filePath: "/tmp/shot.png",
          elementRef: "ref1",
          elementMeta: {},
          route: "/",
        },
      ],
    };
    const result = CaptureResultSchema.parse(input);
    expect(result.screenshots[0].highlightRegion).toBeUndefined();
  });

  it("parses empty screenshots array", () => {
    const result = CaptureResultSchema.parse({ screenshots: [] });
    expect(result.screenshots).toHaveLength(0);
  });
});
