import type { RoutePath } from "../routes.generated.ts";

import { ROUTES } from "../routes.generated.ts";

const HELP = `
routes — 列出所有可调用的 oRPC 端点路径

用法: cat-cli routes [options]

选项:
  --filter <keyword>   按关键词过滤路径（大小写不敏感）
  --json               以 JSON 数组格式输出
  --group              按命名空间分组显示

示例:
  cat-cli routes
  cat-cli routes --filter memory
  cat-cli routes --group
  cat-cli routes --json
`;

/**
 * @zh 按命名空间分组并格式化输出。
 * @en Group routes by namespace and format output.
 */
const formatGrouped = (routes: readonly string[]): string => {
  const groups = new Map<string, string[]>();
  for (const route of routes) {
    const dotIdx = route.indexOf(".");
    const ns = dotIdx > 0 ? route.slice(0, dotIdx) : route;
    const handler = dotIdx > 0 ? route.slice(dotIdx + 1) : route;
    let list = groups.get(ns);
    if (!list) {
      list = [];
      groups.set(ns, list);
    }
    list.push(handler);
  }

  const lines: string[] = [];
  for (const [ns, handlers] of groups) {
    lines.push(`${ns}/`);
    for (const h of handlers) {
      lines.push(`  ${h}`);
    }
  }
  return lines.join("\n");
};

/**
 * @zh 列出所有可调用的 oRPC 端点路径。不需要服务器连接或 API Key。
 * @en List all callable oRPC endpoint paths. No server connection or API Key required.
 */
export const runRoutesCommand = (args: string[]): void => {
  if (args.includes("--help") || args.includes("-h")) {
    // oxlint-disable-next-line no-console
    console.log(HELP);
    return;
  }

  const isJson = args.includes("--json");
  const isGrouped = args.includes("--group");

  // Extract filter keyword
  const filterIdx = args.indexOf("--filter");
  const filterKeyword =
    filterIdx >= 0 && args[filterIdx + 1] ? args[filterIdx + 1] : null;

  let filtered: readonly RoutePath[] | RoutePath[] = ROUTES;
  if (filterKeyword) {
    const lower = filterKeyword.toLowerCase();
    filtered = ROUTES.filter((r) => r.toLowerCase().includes(lower));
  }

  if (filtered.length === 0) {
    // oxlint-disable-next-line no-console
    console.error(
      `[INFO] No routes matching '${filterKeyword}'.\n` +
        `  hint: Run 'cat-cli routes' to see all ${ROUTES.length} available routes.`,
    );
    return;
  }

  if (isJson) {
    // oxlint-disable-next-line no-console
    console.log(JSON.stringify(filtered, null, 2));
    return;
  }

  if (isGrouped) {
    // oxlint-disable-next-line no-console
    console.log(formatGrouped(filtered));
    return;
  }

  // Default: one route per line
  // oxlint-disable-next-line no-console
  console.log(filtered.join("\n"));
};
