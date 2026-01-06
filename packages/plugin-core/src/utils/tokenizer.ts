import type { Token, Tokenizer } from "@/services/tokenizer.ts";

export const tokenize = async (
  text: string,
  rules: { rule: Tokenizer; id: number }[],
): Promise<Token[]> => {
  let cursor = 0;
  const tokens: Token[] = [];
  const length = text.length;

  while (cursor < length) {
    let matchedToken: Token | undefined;
    let matchedRuleId: number | undefined;

    for (const rule of rules) {
      // oxlint-disable-next-line no-await-in-loop
      const result = await rule.rule.parse({
        source: text,
        cursor,
      });
      matchedToken = result?.token;

      if (matchedToken) {
        matchedRuleId = rule.id;
        break;
      }
    }

    if (matchedToken) {
      matchedToken.ruleId = matchedRuleId;
      matchedToken.meta = {
        ...matchedToken.meta,
        matchedRuleId: matchedRuleId ?? -1,
      };
      tokens.push(matchedToken);
      cursor = matchedToken.end;
    } else {
      const char = text[cursor];
      const lastToken = tokens[tokens.length - 1];
      if (lastToken && lastToken.type === "text") {
        lastToken.value += char;
        lastToken.end += 1;
      } else {
        tokens.push({
          type: "text",
          value: char,
          start: cursor,
          end: cursor + 1,
        });
      }
      cursor += 1;
    }
  }

  return tokens;
};

/**
 * 解析子内容
 * @param content 子文本内容
 * @param offsetInParent 子文本在父文本中的起始位置
 */
export const parseInner = async (
  content: string,
  offsetInParent: number,
  rules: { rule: Tokenizer; id: number }[],
): Promise<Token[]> => {
  const rawTokens = await tokenize(content, rules);
  return shiftTokens(rawTokens, offsetInParent);
};

const shiftTokens = (tokens: Token[], offset: number): Token[] => {
  if (offset === 0) return tokens; // 无偏移则直接返回

  return tokens.map((t) => ({
    ...t,
    start: t.start + offset,
    end: t.end + offset,
    // 递归修正 children
    children: t.children ? shiftTokens(t.children, offset) : undefined,
  }));
};
