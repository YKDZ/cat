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
