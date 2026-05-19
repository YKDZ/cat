import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
}));

vi.mock("undici", () => ({
  Pool: class Pool {
    public request = mocks.request;
  },
}));

import { Advisor } from "./advisor";

const buildContext = () => ({
  source: { text: "Hello", languageId: "en", meta: {} },
  terms: [],
  memories: [],
  targetLanguageId: "zh-Hans",
});

describe("LibreTranslate advisor", () => {
  beforeEach(() => {
    mocks.request.mockReset();
  });

  it("falls back to placeholder defaults when config is missing", async () => {
    const advisor = new Advisor({});

    expect(advisor.getAvailability()).toMatchObject({
      available: false,
      reason: "missing-config",
    });

    const suggestions = await advisor.advise(buildContext());

    expect(suggestions[0]?.confidence).toBe(0);
    expect(suggestions[0]?.translation).toContain("requires");
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("treats placeholder keys as unavailable and avoids remote calls", async () => {
    const advisor = new Advisor({
      api: {
        url: "http://localhost:5000/",
        key: "your api key",
        "alternatives-amount": 2,
      },
      base: { "advisor-name": "LibreTranslate" },
    });

    expect(advisor.getAvailability()).toMatchObject({
      available: false,
      reason: "missing-config",
    });

    const suggestions = await advisor.advise(buildContext());

    expect(suggestions[0]?.confidence).toBe(0);
    expect(suggestions[0]?.translation).toContain("requires");
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("requests translations when configured", async () => {
    mocks.request.mockResolvedValue({
      statusCode: 200,
      body: {
        json: vi.fn().mockResolvedValue({
          translatedText: "你好",
          alternatives: ["您好"],
        }),
      },
    });
    const advisor = new Advisor({
      api: {
        url: "http://localhost:5000/",
        key: "real-key",
        "alternatives-amount": 2,
      },
      base: { "advisor-name": "LibreTranslate" },
    });

    expect(advisor.getAvailability()).toEqual({
      available: true,
      reason: "ok",
    });

    const suggestions: Awaited<ReturnType<Advisor["advise"]>> =
      await advisor.advise(buildContext());

    expect(suggestions.map((suggestion) => suggestion.translation)).toEqual([
      "你好",
      "您好",
    ]);
    expect(mocks.request).toHaveBeenCalledOnce();
  });
});
