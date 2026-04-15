/**
 * @zh 解析 --extra-json 并合并到基础对象。
 * @en Parse --extra-json and merge into a base object.
 *
 * @remarks
 * 返回值通过类型断言转为 T，因为 --extra-json 的内容是运行时动态的。
 * 服务端 Zod 校验会捕获任何类型不匹配。
 */
export const mergeExtraJson = <T extends Record<string, unknown>>(
  base: T,
  raw: unknown,
): T => {
  if (typeof raw !== "string") return base;
  try {
    const extra: unknown = JSON.parse(raw);
    if (typeof extra === "object" && extra !== null && !Array.isArray(extra)) {
      return { ...base, ...extra };
    }
    // oxlint-disable-next-line no-console
    console.error(
      "[ERROR] INVALID_EXTRA_JSON: --extra-json must be a JSON object.\n" +
        `  received: ${raw}\n` +
        '  hint: Use \'{"key":"value"}\' format.',
    );
    process.exit(1);
  } catch {
    // oxlint-disable-next-line no-console
    console.error(
      "[ERROR] INVALID_EXTRA_JSON: Cannot parse --extra-json as JSON.\n" +
        `  input: ${raw}\n` +
        "  hint: Ensure the argument is valid JSON.",
    );
    process.exit(1);
  }
};
