import type { NlpToken } from "@cat/shared/schema/nlp";

import { describe, expect, it } from "vitest";

import {
  buildTokenWindows,
  isCjkLanguage,
  joinLemmas,
  joinTokens,
} from "./nlp-normalization";

const makeToken = (text: string, lemma: string): NlpToken => ({
  text,
  lemma,
  pos: "NOUN",
  start: 0,
  end: text.length,
  isStop: false,
  isPunct: false,
});

describe("nlp-normalization", () => {
  it("detects CJK language ids", () => {
    expect(isCjkLanguage("zh")).toBe(true);
    expect(isCjkLanguage("zh-Hans")).toBe(true);
    expect(isCjkLanguage("ja")).toBe(true);
    expect(isCjkLanguage("ko")).toBe(true);
    expect(isCjkLanguage("en")).toBe(false);
  });

  it("joins English tokens with spaces", () => {
    const tokens = [
      makeToken("machine", "machine"),
      makeToken("translation", "translation"),
    ];

    expect(joinTokens(tokens, "en")).toBe("machine translation");
  });

  it("joins CJK tokens without spaces", () => {
    const tokens = [makeToken("机器", "机器"), makeToken("翻译", "翻译")];

    expect(joinTokens(tokens, "zh-Hans")).toBe("机器翻译");
  });

  it("joins lemmas with the language-specific separator", () => {
    const englishTokens = [
      makeToken("running", "run"),
      makeToken("tests", "test"),
    ];
    const cjkTokens = [makeToken("运行", "运行"), makeToken("测试", "测试")];

    expect(joinLemmas(englishTokens, "en")).toBe("run test");
    expect(joinLemmas(cjkTokens, "zh-Hans")).toBe("运行测试");
  });

  it("builds bounded token windows with shared normalization rules", () => {
    const windows = buildTokenWindows(
      [
        makeToken("running", "run"),
        makeToken("tests", "test"),
        makeToken("daily", "daily"),
      ],
      "en",
      2,
    );

    expect(
      windows.map((window) => `${window.surface}|${window.normalized}`),
    ).toEqual([
      "running|run",
      "tests|test",
      "daily|daily",
      "running tests|run test",
      "tests daily|test daily",
    ]);
  });
});
