/**
 * @zh 简单的 {{variable}} 字符串插值。
 * @en Simple {{variable}} string interpolation.
 *
 * @param template - {@zh 包含 {{key}} 占位符的模板字符串} {@en Template string with {{key}} placeholders}
 * @param variables - {@zh 变量键值对} {@en Variable key-value pairs}
 * @returns - {@zh 替换后的字符串} {@en The interpolated string}
 */
export const interpolate = (
  template: string,
  variables: Record<string, string>,
): string => {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    return Object.prototype.hasOwnProperty.call(variables, key)
      ? variables[key]
      : `{{${key}}}`;
  });
};
