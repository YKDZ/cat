import type { Token } from "@cat/plugin-core";

export const countTokenValues = (
  tokens: Token[],
  typeFilter: string,
): Map<string, number> => {
  const map = new Map<string, number>();
  tokens.forEach((t) => {
    if (t.type === typeFilter) {
      map.set(t.value, (map.get(t.value) || 0) + 1);
    }
  });
  return map;
};
