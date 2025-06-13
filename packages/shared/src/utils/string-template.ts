export type StringTemplateContext = Record<
  string,
  string | (() => string) | Date | number
>;

export const useStringTemplate = (
  template: string,
  ctx: StringTemplateContext,
): string => {
  const context = parseContext(ctx);
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const value = context[key];
    if (typeof value === "function") {
      return value();
    }
    return value != null ? String(value) : "";
  });
};

const parseContext = (ctx: StringTemplateContext) => {
  const result: Record<string, string | number | (() => string)> = {};

  for (const [key, value] of Object.entries(ctx)) {
    if (value instanceof Date) {
      delete ctx[key];
      result["year"] = value.getFullYear();
      result["month"] = value.getMonth();
      result["date"] = value.getDate();
      result["day"] = value.getDay();
      result["hours"] = value.getHours();
      result["minutes"] = value.getMinutes();
      result["seconds"] = value.getSeconds();
    } else {
      result[key] = value;
    }
  }

  return result;
};
