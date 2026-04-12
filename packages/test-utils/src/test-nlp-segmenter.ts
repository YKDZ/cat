import type { NlpSegmentResult } from "@cat/shared/schema/nlp";
import type { PluginManifest } from "@cat/shared/schema/plugin";

import { NlpWordSegmenter, type CatPlugin } from "@cat/plugin-core";

const TOKEN_PATTERN = /\p{L}+|\p{N}+|[^\s]/gu;

const buildSegmentResult = (text: string): NlpSegmentResult => {
  const tokens = Array.from(text.matchAll(TOKEN_PATTERN), (match) => {
    const value = match[0];
    const start = match.index ?? 0;
    const end = start + value.length;
    const isPunct = /^[^\p{L}\p{N}]+$/u.test(value);
    const isNumber = /^\p{N}+$/u.test(value);

    return {
      text: value,
      lemma: isPunct ? value : value.toLowerCase(),
      pos: isPunct ? "PUNCT" : isNumber ? "NUM" : "NOUN",
      start,
      end,
      isStop: false,
      isPunct,
    };
  });

  return {
    sentences: [
      {
        text,
        tokens,
        start: 0,
        end: text.length,
      },
    ],
    tokens,
  };
};

export class TestNlpSegmenter extends NlpWordSegmenter {
  public override getId = (): string => "test-nlp-segmenter";

  public override getSupportedLanguages = async (): Promise<string[]> => {
    return ["en", "zh-Hans", "ja", "ko"];
  };

  public override segment = async ({
    text,
  }: {
    text: string;
    languageId: string;
    signal?: AbortSignal;
  }): Promise<NlpSegmentResult> => {
    return buildSegmentResult(text);
  };
}

export const testNlpSegmenterManifest = {
  id: "mock-nlp-segmenter",
  version: "0.0.1",
  entry: "index.js",
  services: [
    {
      id: "test-nlp-segmenter",
      type: "NLP_WORD_SEGMENTER",
      dynamic: false,
    },
  ],
} satisfies PluginManifest;

export const testNlpSegmenterPlugin = {
  services: async () => [new TestNlpSegmenter()],
} satisfies CatPlugin;
