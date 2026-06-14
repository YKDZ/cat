/**
 * Escape a JSON Pointer path segment (RFC 6901).
 */
export const encodeJsonPointerPart = (part: string | number): string => {
  return String(part).replace(/~/g, "~0").replace(/\//g, "~1");
};

/**
 * Combine a namespace and a list of path parts into a stable JSON Pointer-style reference.
 */
export const toJsonPointerRef = (
  namespace: "json" | "yaml" | "markdown" | "source",
  parts: readonly (string | number)[],
): string => {
  if (parts.length === 0) return `${namespace}:/`;
  return `${namespace}:/${parts.map(encodeJsonPointerPart).join("/")}`;
};
