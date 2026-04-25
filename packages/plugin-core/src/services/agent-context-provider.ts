import type { DbHandle } from "@cat/domain";
import type { PluginServiceType } from "@cat/shared";

import * as z from "zod";

import type { IPluginService } from "@/services/service";

// ─── Context Variable Meta ───

/**
 * 描述一个上下文变量的元数据。
 * 与现有 AgentDefinition.systemPromptVariables 中的
 * SystemPromptVariableSchema 形成对应关系，但由 provider 在运行时动态提供。
 */
export const ContextVariableMetaSchema = z.object({
  /** 变量键名，对应提示词中的 {{key}} */
  key: z.string(),
  /** 变量值类型 */
  type: z.enum(["string", "number", "boolean", "json"]),
  /** 人类可读标签（用于 {{contextVariables}} 自动生成的描述块） */
  name: z.string().optional(),
  description: z.string().optional(),
});

export type ContextVariableMeta = z.infer<typeof ContextVariableMetaSchema>;

// ─── Context Provider Dependency ───

/**
 * Provider 声明自己需要从已解析变量 map 中读取哪些键。
 * 这些键可以来自初始种子变量（userId, projectId 等），
 * 也可以来自其他 provider 先产出的变量。
 */
export const ContextProviderDependencySchema = z.object({
  /** 依赖的变量键名 */
  key: z.string(),
  /** 是否为可选依赖；若 optional=true 当依赖缺失时仍会被调用 */
  optional: z.boolean().default(false),
});

export type ContextProviderDependency = z.infer<
  typeof ContextProviderDependencySchema
>;

// ─── Context Resolve Context ───

/**
 * 解析上下文，传递给 provider 的 resolve 方法。
 * 包含当前已解析的变量 map 和数据库客户端以支持查询。
 */
export type ContextResolveContext = {
  /** 当前已解析的所有变量（包括种子变量和前序 provider 产出的变量） */
  resolvedVars: ReadonlyMap<string, string | number | boolean>;
  /** Drizzle 数据库客户端，供 provider 执行查询 */
  drizzle: DbHandle;
  /**
   * 权限检查钩子（预留接口）。
   *
   * 当前默认实现为 `async () => true`（放行所有）。
   * 未来接入权限系统后，resolver 引擎会在调用每个 provider 前
   * 检查当前 agent 身份是否有权访问该 provider 声明的资源。
   *
   * provider 自身也可以在 resolve() 内部调用此钩子
   * 进行更细粒度的资源级权限检查。
   */
  checkPermission: (resource: string, action: string) => Promise<boolean>;
};

// ─── Agent Context Provider Interface ───

/**
 * Agent 上下文提供器插件服务接口。
 *
 * 每个 provider 声明：
 * 1. 自己能提供哪些变量（provides）
 * 2. 自己依赖哪些已有变量（dependencies）
 * 3. 解析逻辑（resolve）
 *
 * 系统通过拓扑排序按顺序调用所有 provider 的 resolve，
 * 将产出的变量累积到同一个 Map 中。
 */
export interface AgentContextProvider extends IPluginService {
  getType(): Extract<PluginServiceType, "AGENT_CONTEXT_PROVIDER">;

  /** 声明此 provider 能产出的变量列表 */
  getProvides(): ContextVariableMeta[];

  /** 声明此 provider 依赖的变量键名列表 */
  getDependencies(): ContextProviderDependency[];

  /**
   * 解析变量。
   * 接收当前上下文（含已解析变量），返回此 provider 产出的变量键值对。
   * 返回的键必须是 getProvides() 中声明过的。
   */
  resolve(
    ctx: ContextResolveContext,
  ): Promise<Map<string, string | number | boolean>>;
}
