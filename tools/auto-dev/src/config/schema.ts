import { z } from "zod/v4";

export const AgentRegistrationSchema = z.object({
  definition: z.string().min(1),
  description: z.string().min(1),
  defaultModel: z.enum(["opus", "sonnet", "haiku"]),
});

export const AutoDevConfigSchema = z.object({
  agents: z.record(z.string(), AgentRegistrationSchema).default({}),
  defaultAgent: z.string().default("full-pipeline"),
  pollIntervalSec: z.int().min(10).max(3600).default(30),
  maxDecisionPerRun: z.int().min(1).max(100).default(20),
  maxImplCycles: z.int().min(1).max(50).default(5),
});

export type AutoDevConfig = z.infer<typeof AutoDevConfigSchema>;
