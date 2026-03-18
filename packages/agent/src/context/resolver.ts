import type { DrizzleClient } from "@cat/domain";
import type {
  AgentContextProvider,
  ContextResolveContext,
} from "@cat/plugin-core";

import { serverLogger as logger } from "@cat/server-shared";

import { topoSortProviders } from "@/context/topo-sort";

// ─── Types ───

/**
 * 种子变量 — 由调用方直接提供，不需要任何 provider 解析。
 * 这些变量是整个依赖链的根节点。
 *
 * 示例种子变量：userId, projectId, languageId, sourceLanguageId,
 * documentId, elementId 等（从 session metadata 提取）。
 */
export type SeedVariables = Map<string, string | number | boolean>;

export type ResolveOptions = {
  /** 种子变量 */
  seeds: SeedVariables;
  /** 所有已注册的 context provider（来自 PluginManager） */
  providers: AgentContextProvider[];
  /** Drizzle 数据库客户端 */
  drizzle: DrizzleClient;
  /** 预留权限检查钩子（默认 pass-through，放行所有） */
  checkPermission?: (resource: string, action: string) => Promise<boolean>;
};

// ─── Default Permission Check ───

const defaultCheckPermission = async (
  _resource: string,
  _action: string,
): Promise<boolean> => true;

// ─── Resolve Context Variables ───

/**
 * 变量解析引擎。
 *
 * 执行流程：
 * 1. 将 seeds 写入初始 Map
 * 2. 收集所有 provider 的 provides/dependencies 声明
 * 3. 调用 topoSortProviders 得到执行顺序（同时完成环路检测）
 * 4. 按拓扑层顺序执行 provider.resolve()（同层 Promise.all 并行）
 *    - 跳过必需依赖缺失的 provider（警告日志）
 *    - 可选依赖缺失时正常调用
 *    - 权限拒绝时跳过（警告日志）
 *    - 将 resolve 返回的变量合并入 Map（键冲突时后者覆盖）
 * 5. 返回最终完整的 Map<string, string | number | boolean>
 */
export const resolveContextVariables = async (
  options: ResolveOptions,
): Promise<Map<string, string | number | boolean>> => {
  const {
    seeds,
    providers,
    drizzle,
    checkPermission = defaultCheckPermission,
  } = options;

  // 1. 初始化 resolved map，写入种子变量
  const resolved = new Map<string, string | number | boolean>(seeds);

  if (providers.length === 0) return resolved;

  // 2. 构建 provider 的形状描述（供拓扑排序使用）
  const providerShapes = providers.map((p) => ({
    provides: p.getProvides(),
    dependencies: p.getDependencies(),
  }));

  // 3. 拓扑排序（同时完成环路检测，失败时向上抛出 CircularDependencyError）
  const layers = topoSortProviders(providerShapes);

  // 4. 按层执行 provider
  for (const layer of layers) {
    // 同一层内的 provider 可以并行执行
    // oxlint-disable-next-line no-await-in-loop
    await Promise.all(
      layer.map(async (idx) => {
        const provider = providers[idx];
        if (!provider) return;

        // 4a. 权限检查
        const providerId = provider.getId();
        const allowed = await checkPermission(
          `context-provider:${providerId}`,
          "resolve",
        );
        if (!allowed) {
          logger.withSituation("AGENT").warn({
            msg: `Permission denied for context provider ${providerId}`,
          });
          return;
        }

        // 4b. 必需依赖校验
        const deps = provider.getDependencies();
        for (const dep of deps) {
          if (!dep.optional && !resolved.has(dep.key)) {
            logger.withSituation("AGENT").warn({
              msg: `Skipping context provider ${providerId}: required dependency "${dep.key}" not resolved`,
            });
            return;
          }
        }

        // 4c. 构建 resolve context
        const ctx: ContextResolveContext = {
          resolvedVars: resolved as ReadonlyMap<
            string,
            string | number | boolean
          >,
          drizzle,
          checkPermission,
        };

        // 4d. 调用 provider.resolve()
        try {
          const result = await provider.resolve(ctx);
          // 4e. 合并结果
          for (const [key, value] of result) {
            resolved.set(key, value);
          }
        } catch (err) {
          logger.withSituation("AGENT").warn({
            msg: `Context provider ${providerId} threw an error during resolve`,
            error: err,
          });
        }
      }),
    );
  }

  return resolved;
};
