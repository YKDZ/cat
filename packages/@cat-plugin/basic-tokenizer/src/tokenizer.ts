import {
  Tokenizer,
  TokenizerPriority,
  type ParserContext,
  type ParseResult,
} from "@cat/plugin-core";

/**
 * 换行符分词器
 * 匹配 \n 换行符
 */
export class NewlineTokenizer extends Tokenizer {
  getId = (): string => "newline-tokenizer";

  getPriority = (): TokenizerPriority => TokenizerPriority.STRUCTURE;

  parse = (ctx: ParserContext): ParseResult | undefined => {
    const { source, cursor } = ctx;
    const remainingText = source.slice(cursor);

    if (remainingText.startsWith("\n")) {
      return {
        token: {
          type: "newline",
          value: "\n",
          start: cursor,
          end: cursor + 1,
        },
      };
    }

    return undefined;
  };
}

/**
 * 阿拉伯数字分词器
 * 匹配连续的阿拉伯数字序列
 */
export class NumberTokenizer extends Tokenizer {
  getId = (): string => "number-tokenizer";

  getPriority = (): TokenizerPriority => TokenizerPriority.LITERAL;

  parse = (ctx: ParserContext): ParseResult | undefined => {
    const { source, cursor } = ctx;
    const remainingText = source.slice(cursor);

    const numberMatch = remainingText.match(/^[0-9]+/);
    if (numberMatch) {
      const value = numberMatch[0];
      return {
        token: {
          type: "number",
          value,
          start: cursor,
          end: cursor + value.length,
        },
      };
    }

    return undefined;
  };
}

/**
 * 空白字符分词器
 * 匹配空格和制表符
 */
export class WhitespaceTokenizer extends Tokenizer {
  getId = (): string => "whitespace-tokenizer";

  getPriority = (): TokenizerPriority => TokenizerPriority.LITERAL;

  parse = (ctx: ParserContext): ParseResult | undefined => {
    const { source, cursor } = ctx;
    const remainingText = source.slice(cursor);

    // 匹配连续的空格和制表符
    const whitespaceMatch = remainingText.match(/^[ \t]+/);
    if (whitespaceMatch) {
      const value = whitespaceMatch[0];
      return {
        token: {
          type: "whitespace",
          value,
          start: cursor,
          end: cursor + value.length,
        },
      };
    }

    return undefined;
  };
}

/**
 * 术语分词器
 * 匹配术语表中的术语
 */
export class TermTokenizer extends Tokenizer {
  getId = (): string => "term-tokenizer";

  getPriority = (): TokenizerPriority => TokenizerPriority.TERM;

  parse = (ctx: ParserContext): ParseResult | undefined => {
    const { source, cursor, terms } = ctx;

    if (!terms || terms.length === 0) {
      return undefined;
    }

    const remainingText = source.slice(cursor);

    // 按长度降序排列，优先匹配更长的术语
    const sortedTerms = [...terms].sort(
      (a, b) => b.term.length - a.term.length,
    );

    for (const termData of sortedTerms) {
      const { term, translation, definition, conceptId, glossaryId } = termData;

      // 大小写不敏感匹配
      const lowerRemaining = remainingText.toLowerCase();
      const lowerTerm = term.toLowerCase();

      if (lowerRemaining.startsWith(lowerTerm)) {
        // 使用原始文本保持大小写
        const matchedValue = remainingText.slice(0, term.length);

        return {
          token: {
            type: "term",
            value: matchedValue,
            start: cursor,
            end: cursor + matchedValue.length,
            meta: {
              term,
              translation,
              definition: definition ?? null,
              conceptId: conceptId ?? null,
              glossaryId: glossaryId ?? null,
            },
          },
        };
      }
    }

    return undefined;
  };
}

/**
 * 标点符号分词器
 * 匹配常见的中文和英文标点符号
 * 注意：这个分词器优先级较低，让其他分词器有机会先匹配
 */
export class PunctuationTokenizer extends Tokenizer {
  getId = (): string => "punctuation-tokenizer";

  getPriority = (): TokenizerPriority => TokenizerPriority.LOWEST;

  parse = (ctx: ParserContext): ParseResult | undefined => {
    const { source, cursor } = ctx;
    const remainingText = source.slice(cursor);

    // 匹配中文标点符号
    const cjkPunctuationMatch = remainingText.match(
      /^[，。！？；：""''、…—【】《》（）「」『』【】〔〕]/,
    );
    if (cjkPunctuationMatch) {
      const value = cjkPunctuationMatch[0];
      return {
        token: {
          type: "text",
          value,
          start: cursor,
          end: cursor + value.length,
        },
      };
    }

    // 匹配英文标点符号
    const asciiPunctuationMatch = remainingText.match(
      /^[,.!?;:'"()[\]{}<>@#$%^&*\-+=|\\/_]/,
    );
    if (asciiPunctuationMatch) {
      const value = asciiPunctuationMatch[0];
      return {
        token: {
          type: "text",
          value,
          start: cursor,
          end: cursor + value.length,
        },
      };
    }

    return undefined;
  };
}
