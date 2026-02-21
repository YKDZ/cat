import type { IPluginService } from "@/services/service";
import type { PluginServiceType } from "@cat/shared/schema/drizzle/enum";
import type { NonNullJSONType } from "@cat/shared/schema/json";

export type TermCandidate = {
  text: string;
  normalizedText: string;
  range: { start: number; end: number }[];
  meta?: NonNullJSONType;
};

export type TermPairCandidate = {
  source: TermCandidate;
  target: TermCandidate;
  alignmentScore: number;
};

export type ExtractContext = {
  text: string;
  languageId: string;
};

export type AlignContext = {
  source: { text: string; candidates: TermCandidate[]; sourceLang: string };
  target: { text: string; candidates: TermCandidate[]; targetLang: string };
};

export abstract class TermExtractor implements IPluginService {
  abstract getId(): string;
  getType(): PluginServiceType {
    return "TERM_EXTRACTOR";
  }
  /**
   * 从给定语言的文本提取术语候选
   */
  abstract extract(ctx: ExtractContext): Promise<TermCandidate[]>;
}

export abstract class TermAligner implements IPluginService {
  abstract getId(): string;
  getType(): PluginServiceType {
    return "TERM_ALIGNER";
  }
  /**
   * 对齐原文和译文中可能的术语
   */
  abstract align(ctx: AlignContext): Promise<TermPairCandidate[]>;
}
