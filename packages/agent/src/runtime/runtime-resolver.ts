import type { DrizzleClient } from "@cat/domain";
import type {
  AgentContextProvider,
  LLMProvider,
  PluginManager,
} from "@cat/plugin-core";
import type { AgentDefinition } from "@cat/shared/schema/agent";

import {
  executeQuery,
  getAgentRunRuntimeState,
  getAgentSessionRuntimeState,
} from "@cat/domain";
import { getServiceFromDBId } from "@cat/server-shared";
import * as z from "zod/v4";

import type { RunId } from "@/graph/types";
import type { AgentToolDefinition } from "@/tools/types";

import { buildSystemPrompt } from "@/session/prompt-builder";
import { resolveDefinition } from "@/session/resolve";
import { mapSessionMetaToSeeds } from "@/session/schema";
import { setupToolRegistry } from "@/session/tool-setup";

import {
  AgentRunRuntimeRefSchema,
  type AgentRunRuntimeRef,
  type PersistedToolSchemaSnapshot,
  type RuntimePromptStrategy,
  parseRuntimeRefFromMetadata,
} from "./runtime-ref";

export type ResolvedGraphRuntimeContext = {
  llmProvider: LLMProvider;
  tools: AgentToolDefinition[];
  systemPrompt: string;
  runtimeRef: AgentRunRuntimeRef;
};

export type ResolveRuntimeForSessionParams = {
  sessionId: number;
  agentDefinitionId: number;
  userId: string;
  sessionMetadata: unknown;
  definition?: AgentDefinition;
  promptStrategy?: RuntimePromptStrategy;
  persistedSystemPrompt?: string;
};

export type ResolveRuntimeForRunParams = {
  runId: RunId;
};

export type RuntimeResolutionService = {
  resolveForSession: (
    params: ResolveRuntimeForSessionParams,
  ) => Promise<ResolvedGraphRuntimeContext>;
  resolveForRun: (
    params: ResolveRuntimeForRunParams,
  ) => Promise<ResolvedGraphRuntimeContext>;
};

type RuntimeResolverOptions = {
  drizzle: DrizzleClient;
  pluginManager: PluginManager;
  cacheTtlMs?: number;
};

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

type SessionState = {
  sessionId: number;
  agentDefinitionId: number;
  userId: string;
  sessionMetadata: unknown;
};

const DEFAULT_CACHE_TTL_MS = 30_000;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const hasContextProviderShape = (
  value: unknown,
): value is AgentContextProvider => {
  if (!isRecord(value)) return false;

  const getType = Reflect.get(value, "getType");
  const getProvides = Reflect.get(value, "getProvides");
  const getDependencies = Reflect.get(value, "getDependencies");
  const resolve = Reflect.get(value, "resolve");

  return (
    typeof getType === "function" &&
    typeof getProvides === "function" &&
    typeof getDependencies === "function" &&
    typeof resolve === "function"
  );
};

const getCachedValue = <T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
): T | null => {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
};

const setCachedValue = <T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  value: T,
  ttlMs: number,
): T => {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
  return value;
};

const sortSnapshot = (
  snapshots: PersistedToolSchemaSnapshot[],
): PersistedToolSchemaSnapshot[] => {
  return [...snapshots].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
};

const normalizeJsonValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeJsonValue(item));
  }

  if (isRecord(value)) {
    const normalized: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      normalized[key] = normalizeJsonValue(item);
    }
    return normalized;
  }

  return value;
};

const snapshotMatches = (
  actual: PersistedToolSchemaSnapshot[],
  expected: PersistedToolSchemaSnapshot[],
): boolean => {
  if (actual.length !== expected.length) return false;

  const left = sortSnapshot(actual);
  const right = sortSnapshot(expected);

  return left.every((item, index) => {
    const other = right[index];
    if (!other) return false;

    return (
      item.name === other.name &&
      item.description === other.description &&
      JSON.stringify(normalizeJsonValue(item.parameters)) ===
        JSON.stringify(normalizeJsonValue(other.parameters))
    );
  });
};

export class RuntimeResolver implements RuntimeResolutionService {
  readonly #drizzle: DrizzleClient;

  readonly #pluginManager: PluginManager;

  readonly #cacheTtlMs: number;

  readonly #sessionCache = new Map<
    string,
    CacheEntry<ResolvedGraphRuntimeContext>
  >();

  readonly #runCache = new Map<
    string,
    CacheEntry<ResolvedGraphRuntimeContext>
  >();

  constructor(options: RuntimeResolverOptions) {
    this.#drizzle = options.drizzle;
    this.#pluginManager = options.pluginManager;
    this.#cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  }

  resolveForSession = async (
    params: ResolveRuntimeForSessionParams,
  ): Promise<ResolvedGraphRuntimeContext> => {
    const promptStrategy = params.promptStrategy ?? "persisted";
    const cacheKey = [
      "session",
      params.sessionId,
      params.agentDefinitionId,
      params.userId,
      promptStrategy,
      params.persistedSystemPrompt ?? "",
    ].join(":");

    const cached = getCachedValue(this.#sessionCache, cacheKey);
    if (cached) return cached;

    const definition =
      params.definition ??
      (await resolveDefinition(this.#drizzle, params.agentDefinitionId));
    const tools = await this.resolveTools({ definition });
    const systemPrompt = await this.resolveSystemPrompt({
      definition,
      tools,
      sessionMetadata: params.sessionMetadata,
      userId: params.userId,
      promptStrategy,
      persistedSystemPrompt: params.persistedSystemPrompt,
    });
    const llmProvider = getServiceFromDBId<LLMProvider>(
      this.#pluginManager,
      definition.llm.providerId,
    );
    const runtimeRef = AgentRunRuntimeRefSchema.parse({
      sessionId: params.sessionId,
      agentDefinitionId: params.agentDefinitionId,
      userId: params.userId,
      llmProviderDbId: definition.llm.providerId,
      toolNames: tools.map((tool) => tool.name),
      toolSnapshot: this.serializeToolSnapshot(tools),
      promptStrategy,
      ...(promptStrategy === "persisted"
        ? { persistedSystemPrompt: systemPrompt }
        : {}),
    });

    return setCachedValue(
      this.#sessionCache,
      cacheKey,
      {
        llmProvider,
        tools,
        systemPrompt,
        runtimeRef,
      },
      this.#cacheTtlMs,
    );
  };

  resolveForRun = async (
    params: ResolveRuntimeForRunParams,
  ): Promise<ResolvedGraphRuntimeContext> => {
    const cacheKey = `run:${params.runId}`;
    const cached = getCachedValue(this.#runCache, cacheKey);
    if (cached) return cached;

    const row = await executeQuery(
      { db: this.#drizzle },
      getAgentRunRuntimeState,
      { runId: params.runId },
    );

    if (!row) {
      throw new Error(`Agent run not found: ${params.runId}`);
    }

    const runtimeRef = parseRuntimeRefFromMetadata(row.metadata);
    const resolved = runtimeRef
      ? await this.resolveRuntimeFromRef(runtimeRef)
      : await this.resolveLegacyRunRuntime({
          runId: params.runId,
          sessionId: row.sessionId,
        });

    return setCachedValue(this.#runCache, cacheKey, resolved, this.#cacheTtlMs);
  };

  resolveSystemPrompt = async (params: {
    definition: AgentDefinition;
    tools: AgentToolDefinition[];
    sessionMetadata: unknown;
    userId: string;
    promptStrategy: RuntimePromptStrategy;
    persistedSystemPrompt?: string;
  }): Promise<string> => {
    if (
      params.promptStrategy === "persisted" &&
      typeof params.persistedSystemPrompt === "string"
    ) {
      return params.persistedSystemPrompt;
    }

    const contextProviders = this.getContextProviders();
    return buildSystemPrompt({
      drizzle: this.#drizzle,
      definition: params.definition,
      seedsVars: mapSessionMetaToSeeds(params.sessionMetadata),
      userId: params.userId,
      tools: params.tools,
      contextProviders,
    });
  };

  resolveTools = async (params: {
    definition: AgentDefinition;
    toolNames?: string[];
    toolSnapshot?: PersistedToolSchemaSnapshot[];
  }): Promise<AgentToolDefinition[]> => {
    const tools = setupToolRegistry({ definition: params.definition });
    const selectedTools =
      params.toolNames && params.toolNames.length > 0
        ? tools.filter((tool) => {
            return params.toolNames?.includes(tool.name) ?? false;
          })
        : tools;

    const selectedNames = new Set(selectedTools.map((tool) => tool.name));
    if (params.toolNames?.some((toolName) => !selectedNames.has(toolName))) {
      throw new Error("Some persisted tools are no longer available");
    }

    if (params.toolSnapshot && params.toolSnapshot.length > 0) {
      const snapshot = this.serializeToolSnapshot(selectedTools);
      if (!snapshotMatches(snapshot, params.toolSnapshot)) {
        throw new Error(
          "Persisted tool schema snapshot does not match runtime tools",
        );
      }
    }

    return selectedTools;
  };

  private resolveRuntimeFromRef = async (
    runtimeRef: AgentRunRuntimeRef,
  ): Promise<ResolvedGraphRuntimeContext> => {
    const definition = await resolveDefinition(
      this.#drizzle,
      runtimeRef.agentDefinitionId,
    );
    const sessionState = await this.getSessionState(runtimeRef.sessionId);
    const tools = await this.resolveTools({
      definition,
      toolNames: runtimeRef.toolNames,
      toolSnapshot: runtimeRef.toolSnapshot,
    });
    const systemPrompt = await this.resolveSystemPrompt({
      definition,
      tools,
      sessionMetadata: sessionState.sessionMetadata,
      userId: runtimeRef.userId,
      promptStrategy: runtimeRef.promptStrategy,
      persistedSystemPrompt: runtimeRef.persistedSystemPrompt,
    });
    const llmProvider = getServiceFromDBId<LLMProvider>(
      this.#pluginManager,
      runtimeRef.llmProviderDbId,
    );

    return {
      llmProvider,
      tools,
      systemPrompt,
      runtimeRef,
    };
  };

  private resolveLegacyRunRuntime = async (params: {
    runId: RunId;
    sessionId: number;
  }): Promise<ResolvedGraphRuntimeContext> => {
    const sessionState = await this.getSessionState(params.sessionId);

    return this.resolveForSession({
      sessionId: sessionState.sessionId,
      agentDefinitionId: sessionState.agentDefinitionId,
      userId: sessionState.userId,
      sessionMetadata: sessionState.sessionMetadata,
      promptStrategy: "rebuild",
    });
  };

  private getSessionState = async (
    sessionId: number,
  ): Promise<SessionState> => {
    const row = await executeQuery(
      { db: this.#drizzle },
      getAgentSessionRuntimeState,
      { sessionId },
    );

    if (!row) {
      throw new Error(`Agent session not found: ${String(sessionId)}`);
    }

    return {
      sessionId: row.sessionId,
      agentDefinitionId: row.agentDefinitionId,
      userId: row.userId ?? "",
      sessionMetadata: row.sessionMetadata,
    };
  };

  private getContextProviders = (): AgentContextProvider[] => {
    return this.#pluginManager
      .getServices("AGENT_CONTEXT_PROVIDER")
      .map((entry) => entry.service)
      .filter((service) => hasContextProviderShape(service));
  };

  private serializeToolSnapshot = (
    tools: AgentToolDefinition[],
  ): PersistedToolSchemaSnapshot[] => {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: z.toJSONSchema(tool.parameters),
    }));
  };
}

export const createRuntimeResolver = (
  options: RuntimeResolverOptions,
): RuntimeResolver => {
  return new RuntimeResolver(options);
};
