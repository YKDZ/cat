import { describe, expect, it } from "vitest";

import type {
  NavigationStep,
  ScreenshotCollectOptions,
  ScreenshotRoute,
} from "../types.ts";

describe("screenshot collector types", () => {
  it("should accept valid route config with navigation steps", () => {
    const route: ScreenshotRoute = {
      path: "/projects",
      waitAfterLoad: 2000,
      steps: [
        { action: "click", selector: '[data-testid="login"]' },
        { action: "fill", selector: "#email", value: "test@test.com" },
        { action: "wait", ms: 500 },
      ],
    };

    expect(route.path).toBe("/projects");
    expect(route.steps).toHaveLength(3);
  });

  it("should accept minimal route config", () => {
    const route: ScreenshotRoute = { path: "/" };
    expect(route.path).toBe("/");
    expect(route.waitAfterLoad).toBeUndefined();
    expect(route.steps).toBeUndefined();
  });

  it("should accept valid collect options", () => {
    const options: ScreenshotCollectOptions = {
      baseUrl: "http://localhost:3000",
      routes: [{ path: "/" }],
      elements: [],
      outputDir: "/tmp/screenshots",
      headless: true,
    };

    expect(options.baseUrl).toBe("http://localhost:3000");
    expect(options.headless).toBe(true);
  });

  it("should accept navigation steps of all action types", () => {
    const steps: NavigationStep[] = [
      { action: "click", selector: "button.submit" },
      { action: "fill", selector: "input.name", value: "test" },
      { action: "wait", ms: 1000 },
    ];

    expect(steps).toHaveLength(3);
    expect(steps[0]?.action).toBe("click");
    expect(steps[1]?.action).toBe("fill");
    expect(steps[2]?.action).toBe("wait");
  });
});
