import type { IPluginService } from "@/registry/plugin-registry.ts";
import type { NonNullJSONType } from "@cat/shared/schema/json";

export type TermCandidate = {
  text: string;
  normalizedText: string;
  range: { start: number; end: number }[];
  meta?: NonNullJSONType;
};

export type RecognizedTermEntry = {
  termEntryId: number;
  confidence: number;
};

export type TermPairCandidate = {
  source: TermCandidate;
  target: TermCandidate;
  alignmentScore: number;
};

export interface TermExtractor extends IPluginService {
  /**
   * 从给定语言的文本提取术语候选
   */
  extract(text: string, languageId: string): Promise<TermCandidate[]>;
}

export interface TermRecognizer extends IPluginService {
  /**
   * 根据候选结果从数据库维护的术语库中查出所有匹配的 TermEntry
   */
  recognize(
    source: { text: string; candidates: TermCandidate[] },
    languageId: string,
  ): Promise<RecognizedTermEntry[]>;
}

export interface TermAligner extends IPluginService {
  /**
   * 对齐原文和译文中可能的术语
   */
  align(
    source: { text: string; candidates: TermCandidate[]; sourceLang: string },
    target: { text: string; candidates: TermCandidate[]; targetLang: string },
  ): Promise<TermPairCandidate[]>;
}
