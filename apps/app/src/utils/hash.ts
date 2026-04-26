const stableStringify = <T>(value: T): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const entries = Object.entries(value).map(
    ([key, val]) => `${JSON.stringify(key)}:${val}`,
  );

  return `{${entries.join(",")}}`;
};

export const hashJSON = async <
  T extends object | unknown[] | string | number | boolean | null,
>(
  value: T,
): Promise<string> => {
  const json = stableStringify(value);
  const bytes = new TextEncoder().encode(json);

  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hashBuffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};
