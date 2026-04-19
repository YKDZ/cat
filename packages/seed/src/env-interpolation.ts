/**
 * Recursively walk a parsed YAML value and interpolate ${VAR} patterns
 * in every string leaf. Non-string primitives, arrays, and object
 * structures are traversed but never modified.
 *
 * Syntax supported inside string values:
 *   ${VAR}          — required, throws if not set
 *   ${VAR:-default} — uses "default" if VAR is unset or empty
 */
const ENV_PATTERN = /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-(.*?))?\}/g;

const interpolateString = (input: string): string =>
  input.replace(
    ENV_PATTERN,
    (_match, varName: string, defaultValue: string | undefined) => {
      const value = process.env[varName];
      if (value !== undefined && value !== "") return value;
      if (defaultValue !== undefined) return defaultValue;
      throw new Error(
        `Environment variable "${varName}" is not set and no default was provided. ` +
          `Set it in your shell or use \${${varName}:-default} syntax in seed.yaml.`,
      );
    },
  );

export const interpolateEnvVars = (obj: unknown): unknown => {
  if (typeof obj === "string") return interpolateString(obj);
  if (Array.isArray(obj)) return obj.map(interpolateEnvVars);
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = interpolateEnvVars(value);
    }
    return result;
  }
  return obj; // number, boolean, null — pass through
};
