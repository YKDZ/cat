/**
 * Simple {{variable}} string interpolation.
 *
 * @param template - {Template string with {{key}} placeholders}
 * @param variables - Variable key-value pairs
 * @returns - The interpolated string
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
