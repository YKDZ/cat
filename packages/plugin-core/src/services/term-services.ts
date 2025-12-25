import type { IPluginService } from "@/services/service";
import type { PluginServiceType } from "@cat/shared/schema/drizzle/enum";
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

export abstract class TermExtractor implements IPluginService {
  abstract getId(): string;
  getType(): PluginServiceType {
    return "TERM_EXTRACTOR";
  }
  /**
   * 从给定语言的文本提取术语候选
   */
  abstract extract(text: string, languageId: string): Promise<TermCandidate[]>;
}

export abstract class TermRecognizer implements IPluginService {
  abstract getId(): string;
  getType(): PluginServiceType {
    return "TERM_RECOGNIZER";
  }
  /**
   * 根据候选结果从数据库维护的术语库中查出所有匹配的 TermEntry
   */
  abstract recognize(
    source: { text: string; candidates: TermCandidate[] },
    languageId: string,
  ): Promise<RecognizedTermEntry[]>;
}

export abstract class TermAligner implements IPluginService {
  abstract getId(): string;
  getType(): PluginServiceType {
    return "TERM_ALIGNER";
  }
  /**
   * 对齐原文和译文中可能的术语
   */
  abstract align(
    source: { text: string; candidates: TermCandidate[]; sourceLang: string },
    target: { text: string; candidates: TermCandidate[]; targetLang: string },
  ): Promise<TermPairCandidate[]>;
}
