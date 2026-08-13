import { type LanguageAnalysisToken, normalizeLanguageId } from "@cat/shared";
import { describe, expect, it } from "vitest";

import {
  buildTokenWindows,
  isCjkLanguage,
  joinLemmas,
  joinTokens,
  normalizeTokenLemma,
} from "./language-analysis-normalization.ts";

const makeToken = (text: string, lemma: string): LanguageAnalysisToken => ({
  text,
  lemma,
  pos: "NOUN",
  start: 0,
  end: text.length,
  isStop: false,
  isPunct: false,
});

describe("language-analysis-normalization", () => {
  it("detects CJK language ids", () => {
    expect(isCjkLanguage(normalizeLanguageId("zh"))).toBe(true);
    expect(isCjkLanguage(normalizeLanguageId("zh-Hans"))).toBe(true);
    expect(isCjkLanguage(normalizeLanguageId("ja"))).toBe(true);
    expect(isCjkLanguage(normalizeLanguageId("ko"))).toBe(true);
    expect(isCjkLanguage(normalizeLanguageId("en"))).toBe(false);
  });

  it("joins English tokens with spaces", () => {
    const tokens = [
      makeToken("machine", "machine"),
      makeToken("translation", "translation"),
    ];

    expect(joinTokens(tokens, normalizeLanguageId("en"))).toBe(
      "machine translation",
    );
  });

  it("joins CJK tokens without spaces", () => {
    const tokens = [makeToken("机器", "机器"), makeToken("翻译", "翻译")];

    expect(joinTokens(tokens, normalizeLanguageId("zh-Hans"))).toBe("机器翻译");
  });

  it("joins lemmas with the language-specific separator", () => {
    const englishTokens = [
      makeToken("running", "run"),
      makeToken("tests", "test"),
    ];
    const cjkTokens = [makeToken("运行", "运行"), makeToken("测试", "测试")];

    expect(joinLemmas(englishTokens, normalizeLanguageId("en"))).toBe(
      "run test",
    );
    expect(joinLemmas(cjkTokens, normalizeLanguageId("zh-Hans"))).toBe(
      "运行测试",
    );
  });

  it("uses the token surface when an analyzer returns an empty lemma", () => {
    const tokens = [makeToken("允许", ""), makeToken("传送", "")];

    expect(normalizeTokenLemma(tokens[0]!)).toBe("允许");
    expect(joinLemmas(tokens, normalizeLanguageId("zh-Hans"))).toBe("允许传送");
  });

  it("builds bounded token windows with shared normalization rules", () => {
    const windows = buildTokenWindows(
      [
        makeToken("running", "run"),
        makeToken("tests", "test"),
        makeToken("daily", "daily"),
      ],
      normalizeLanguageId("en"),
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
