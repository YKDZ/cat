/**
 * Resolve `$ref:<name>` placeholders in a route template string using the provided bindings.
 *
 * Placeholder syntax: `$ref:<name>` where <name> extends to the next `/` or end of string.
 * Allowed characters in name: letters, digits, `:`, `-`, `_`.
 *
 * @throws Error listing all missing binding names if any placeholder cannot be resolved.
 */
export function resolveRouteTemplate(
  template: string,
  bindings: Record<string, string>,
): string {
  const PLACEHOLDER_RE = /\$ref:([a-zA-Z0-9:_-]+)/g;
  const missing: string[] = [];

  const resolved = template.replace(PLACEHOLDER_RE, (_match, name: string) => {
    const value = bindings[name];
    if (value === undefined) {
      missing.push(name);
      return _match; // keep original for error reporting
    }
    return value;
  });

  if (missing.length > 0) {
    throw new Error(
      `Missing bindings for route template "${template}": ${missing.join(", ")}`,
    );
  }

  return resolved;
}
