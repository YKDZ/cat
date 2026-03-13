export const resolvePath = (data: unknown, path: string): unknown => {
  if (!path) return undefined;
  const segments = path.split(".").filter(Boolean);
  let cursor: unknown = data;
  for (const segment of segments) {
    if (typeof cursor !== "object" || cursor === null) return undefined;
    cursor = Reflect.get(cursor, segment);
  }
  return cursor;
};

export const interpolateTemplate = (
  template: string,
  data: unknown,
): string => {
  return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_raw, pathLike) => {
    const value = resolvePath(data, String(pathLike).trim());
    if (value === undefined || value === null) return "";
    if (typeof value === "string") return value;
    return JSON.stringify(value);
  });
};

export const hashArgs = (args: Record<string, unknown>): string => {
  const serialized = JSON.stringify(args);
  let hash = 0;
  for (let i = 0; i < serialized.length; i += 1) {
    hash = (hash << 5) - hash + serialized.charCodeAt(i);
    hash |= 0;
  }
  return `h${Math.abs(hash)}`;
};
