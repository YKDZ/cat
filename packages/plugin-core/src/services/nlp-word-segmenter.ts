import type { PluginServiceType } from "@cat/shared";
import type { NlpSegmentResult, NlpBatchSegmentResult } from "@cat/shared";

import type { IPluginService } from "./service";

export type {
  NlpToken,
  NlpSentence,
  NlpSegmentResult,
  NlpBatchSegmentResult,
} from "@cat/shared";

/**
 * 分词请求上下文
 */
export type NlpSegmentContext = {
  /** 需要分词的文本 */
  text: string;
  /** BCP 47 语言标识符 (如 "en", "zh-Hans", "ja") */
  languageId: string;
  /** 取消信号 */
  signal?: AbortSignal;
};

/**
 * 批量分词请求上下文
 */
export type NlpBatchSegmentContext = {
  /** 批量文本条目 */
  items: Array<{
    /** 条目标识（透传回结果，用于调用方关联） */
    id: string;
    /** 需要分词的文本 */
    text: string;
  }>;
  /** 语言标识符（同一批次应为同一语言） */
  languageId: string;
  /** 取消信号 */
  signal?: AbortSignal;
};

/**
 * NLP 自然语言分词服务
 *
 * 适配 spaCy 等 NLP 工具的分词能力。
 * 与 TOKENIZER 的区别：
 * - TOKENIZER: 面向 UI 的规则分词（优先级匹配、结构化 Token 树）
 * - NLP_WORD_SEGMENTER: 面向 NLP 的语言学分词（POS、lemma、停用词）
 */
export abstract class NlpWordSegmenter implements IPluginService {
  abstract getId(): string;

  getType(): PluginServiceType {
    return "NLP_WORD_SEGMENTER";
  }

  /**
   * 查询此分词器支持的语言列表
   * @returns BCP 47 语言代码数组（如 ["en", "zh-Hans", "ja", "de"]）
   */
  abstract getSupportedLanguages(): Promise<string[]>;

  /**
   * 单文本分词
   */
  abstract segment(ctx: NlpSegmentContext): Promise<NlpSegmentResult>;

  /**
   * 批量分词（默认实现：逐条调用 segment）
   * 实现方可覆盖此方法以利用后端批量 API 提升性能
   */
  batchSegment = async (
    ctx: NlpBatchSegmentContext,
  ): Promise<NlpBatchSegmentResult> => {
    const results = await Promise.all(
      ctx.items.map(async (item) => ({
        id: item.id,
        result: await this.segment({
          text: item.text,
          languageId: ctx.languageId,
          signal: ctx.signal,
        }),
      })),
    );
    return { results };
  };
}
