import type { DrizzleClient } from "@cat/domain";
import type {
  ContextProviderDependency,
  ContextResolveContext,
  ContextVariableMeta,
} from "@cat/plugin-core";
import type { AgentDefinition } from "@cat/shared/schema/agent";
import type { PluginServiceType } from "@cat/shared/schema/enum";

import { executeQuery, listProjectGlossaryIds } from "@cat/domain";
import * as z from "zod/v4";

import type { AgentToolDefinition } from "@/tools/types";

import { generateToolDescriptions } from "@/utils/prompt";

// ─── Type alias for provider type literal ───

type AgentContextProviderType = Extract<
  PluginServiceType,
  "AGENT_CONTEXT_PROVIDER"
>;

// ─── 1. BuiltinGlossaryProvider ───

/**
 * 从数据库中查询与项目关联的词汇表 ID，提供 `glossaryIds` 变量。
 * 当 `projectId` 不存在时返回空 JSON 数组。
 */
export class BuiltinGlossaryProvider {
  readonly #drizzle: DrizzleClient;

  constructor(drizzle: DrizzleClient) {
    this.#drizzle = drizzle;
  }

  getId = (): string => "builtin:glossary";

  getType = (): AgentContextProviderType => "AGENT_CONTEXT_PROVIDER";

  getProvides = (): ContextVariableMeta[] => [
    {
      key: "glossaryIds",
      type: "json",
      name: "Glossary IDs",
      description: "JSON array of glossary IDs linked to the current project",
    },
  ];

  getDependencies = (): ContextProviderDependency[] => [
    { key: "projectId", optional: true },
  ];

  resolve = async (
    ctx: ContextResolveContext,
  ): Promise<Map<string, string | number | boolean>> => {
    const result = new Map<string, string | number | boolean>();
    const rawProjectId = ctx.resolvedVars.get("projectId");
    const projectId = z.string().optional().parse(rawProjectId);

    if (projectId) {
      const glossaryIds = await executeQuery(
        { db: this.#drizzle },
        listProjectGlossaryIds,
        { projectId },
      );
      result.set("glossaryIds", JSON.stringify(glossaryIds));
    } else {
      result.set("glossaryIds", "[]");
    }

    return result;
  };
}

// ─── 2. BuiltinContextDescriptionProvider ───

/**
 * 将 `AgentDefinition.systemPromptVariables` 渲染为"Available context:"描述块，
 * 并将已解析的变量值直接注入描述行（而非留下 {{key}} 占位符）。
 *
 * 声明对所有 systemPromptVariables 键的可选依赖，确保在变量值可用后再执行。
 */
export class BuiltinContextDescriptionProvider {
  readonly #definition: AgentDefinition;

  constructor(definition: AgentDefinition) {
    this.#definition = definition;
  }

  getId = (): string => "builtin:context-description";

  getType = (): AgentContextProviderType => "AGENT_CONTEXT_PROVIDER";

  getProvides = (): ContextVariableMeta[] => [
    {
      key: "contextVariables",
      type: "string",
      name: "Context Variables Block",
      description:
        "Auto-generated description block for all declared context variables",
    },
  ];

  getDependencies = (): ContextProviderDependency[] => {
    const vars = this.#definition.systemPromptVariables ?? {};
    return Object.keys(vars).map((key) => ({ key, optional: true }));
  };

  resolve = async (
    ctx: ContextResolveContext,
  ): Promise<Map<string, string | number | boolean>> => {
    const result = new Map<string, string | number | boolean>();
    const vars = this.#definition.systemPromptVariables ?? {};
    const entries = Object.entries(vars);

    if (entries.length === 0) {
      result.set("contextVariables", "");
      return result;
    }

    const lines = entries.map(([key, def]) => {
      const label = def.name ?? key;
      const value = ctx.resolvedVars.get(key);
      // 若已解析则直接嵌入，否则保留 {{key}} 占位符（backward-compat 回退）
      const displayValue = value !== undefined ? String(value) : `{{${key}}}`;
      return `- ${label}: ${displayValue}`;
    });

    // 如果没有任何变量有实际值，不输出整个上下文块
    const hasAnyValue = entries.some(([key]) => {
      const value = ctx.resolvedVars.get(key);
      return value !== undefined && String(value).trim() !== "";
    });

    if (!hasAnyValue) {
      result.set("contextVariables", "");
      return result;
    }

    result.set("contextVariables", ["Available context:", ...lines].join("\n"));
    return result;
  };
}

// ─── 3. BuiltinToolDescriptionProvider ───

/**
 * 将工具定义渲染为 `{{toolDescriptions}}` 变量的值。
 */
export class BuiltinToolDescriptionProvider {
  readonly #tools: ReadonlyArray<AgentToolDefinition>;

  constructor(tools: ReadonlyArray<AgentToolDefinition>) {
    this.#tools = tools;
  }

  getId = (): string => "builtin:tool-descriptions";

  getType = (): AgentContextProviderType => "AGENT_CONTEXT_PROVIDER";

  getProvides = (): ContextVariableMeta[] => [
    {
      key: "toolDescriptions",
      type: "string",
      name: "Tool Descriptions Block",
      description: "Auto-generated listing of available agent tools",
    },
  ];

  getDependencies = (): ContextProviderDependency[] => [];

  resolve = async (
    _ctx: ContextResolveContext,
  ): Promise<Map<string, string | number | boolean>> => {
    const result = new Map<string, string | number | boolean>();
    result.set("toolDescriptions", generateToolDescriptions(this.#tools));
    return result;
  };
}

// ─── Factory ───

/**
 * 创建内置 provider 实例数组。
 *
 * 注意：`BuiltinGlossaryProvider` 需要直接访问 DB，
 * 因此独立于 ContextResolveContext 直接注入 drizzle 客户端。
 * （这与 resolver 传递给 resolve() 的 drizzle 是同一个实例。）
 */
export const createBuiltinProviders = (params: {
  definition: AgentDefinition;
  tools: ReadonlyArray<AgentToolDefinition>;
  drizzle: DrizzleClient;
}): [
  BuiltinGlossaryProvider,
  BuiltinContextDescriptionProvider,
  BuiltinToolDescriptionProvider,
] => [
  new BuiltinGlossaryProvider(params.drizzle),
  new BuiltinContextDescriptionProvider(params.definition),
  new BuiltinToolDescriptionProvider(params.tools),
];
