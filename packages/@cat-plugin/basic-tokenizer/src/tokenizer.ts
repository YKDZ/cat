import {
  Tokenizer,
  TokenizerPriority,
  type ParserContext,
  type ParseResult,
} from "@cat/plugin-core";

export class SimplePatternTokenizer extends Tokenizer {
  getId = (): string => "simple-pattern-tokenizer";

  getPriority = (): TokenizerPriority => TokenizerPriority.VARIABLE;

  parse = (ctx: ParserContext): ParseResult | undefined => {
    const { source, cursor } = ctx;
    const remainingText = source.slice(cursor);

    // 1. 匹配变量: % + 一个英文小写字母 (例如 %s, %d)
    const variableMatch = remainingText.match(/^%[a-z]/);
    if (variableMatch) {
      const value = variableMatch[0];
      return {
        token: {
          type: "variable",
          value,
          start: cursor,
          end: cursor + value.length,
        },
      };
    }

    // 2. 匹配换行符
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

    // 3. 匹配所有阿拉伯数字
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

export class TermTokenizer extends Tokenizer {
  getId = (): string => "term-tokenizer";

  getPriority = (): TokenizerPriority => TokenizerPriority.TERM;

  parse = (ctx: ParserContext): ParseResult | undefined => {
    const { source, cursor, terms } = ctx;

    // 如果没有提供术语数据，直接返回
    if (!terms || terms.length === 0) {
      return undefined;
    }

    const remainingText = source.slice(cursor);

    // 寻找匹配的术语
    // 按长度降序排列，优先匹配更长的术语
    const sortedTerms = [...terms].sort(
      (a, b) => b.term.length - a.term.length,
    );

    for (const termData of sortedTerms) {
      const { term, translation, definition, conceptId, glossaryId } = termData;

      // 大小写不敏感匹配（可根据需要调整）
      const lowerRemaining = remainingText.toLowerCase();
      const lowerTerm = term.toLowerCase();

      if (lowerRemaining.startsWith(lowerTerm)) {
        // 找到匹配，使用原始文本保持大小写
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
              definition: definition ?? undefined,
              conceptId: conceptId ?? undefined,
              glossaryId: glossaryId ?? undefined,
            },
          },
        };
      }
    }

    return undefined;
  };
}
