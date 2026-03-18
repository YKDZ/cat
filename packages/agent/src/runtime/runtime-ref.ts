import { safeZDotJson } from "@cat/shared/schema/json";
import * as z from "zod/v4";

export const RuntimePromptStrategySchema = z.enum(["persisted", "rebuild"]);

export const PersistedToolSchemaSnapshotSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  parameters: safeZDotJson,
});

export const AgentRunRuntimeRefSchema = z.object({
  sessionId: z.int().positive(),
  agentDefinitionId: z.int().positive(),
  userId: z.string(),
  llmProviderDbId: z.int().positive(),
  toolNames: z.array(z.string().min(1)).default([]),
  toolSnapshot: z.array(PersistedToolSchemaSnapshotSchema).default([]),
  promptStrategy: RuntimePromptStrategySchema,
  persistedSystemPrompt: z.string().optional(),
});

export type RuntimePromptStrategy = z.infer<typeof RuntimePromptStrategySchema>;
export type PersistedToolSchemaSnapshot = z.infer<
  typeof PersistedToolSchemaSnapshotSchema
>;
export type AgentRunRuntimeRef = z.infer<typeof AgentRunRuntimeRefSchema>;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

export const parseRuntimeRefFromMetadata = (
  metadata: unknown,
): AgentRunRuntimeRef | null => {
  if (!isRecord(metadata)) return null;
  const runtimeRef = Reflect.get(metadata, "runtimeRef");
  const parsed = AgentRunRuntimeRefSchema.safeParse(runtimeRef);
  return parsed.success ? parsed.data : null;
};

export const withRuntimeRefMetadata = (params: {
  sessionId?: number;
  runtimeRef?: AgentRunRuntimeRef;
  metadata?: Record<string, unknown> | null;
}): Record<string, unknown> | null => {
  const result: Record<string, unknown> = {
    ...(params.metadata ?? {}),
  };

  if (params.sessionId !== undefined) {
    result["sessionId"] = params.sessionId;
  }

  if (params.runtimeRef) {
    result["runtimeRef"] = params.runtimeRef;
  }

  return Object.keys(result).length > 0 ? result : null;
};
