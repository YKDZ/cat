const stableStringify = <T>(value: T): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const entries = keys.map((key) => {
    const val = stableStringify(obj[key]);
    return `${JSON.stringify(key)}:${val}`;
  });

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
