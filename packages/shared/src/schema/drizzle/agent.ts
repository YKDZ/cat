import z from "zod";

import { AgentDefinitionSchema as AgentDefJsonSchema } from "../agent";
import { DrizzleDateTimeSchema } from "../misc";
import { AgentDefinitionTypeSchema, ScopeTypeSchema } from "./enum";

export const AgentDefinitionSchema = z.object({
  id: z.int(),
  externalId: z.uuidv4(),
  scopeType: ScopeTypeSchema,
  scopeId: z.string(),
  name: z.string(),
  description: z.string(),
  type: AgentDefinitionTypeSchema,
  definition: AgentDefJsonSchema,
  isBuiltin: z.boolean(),
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
});

export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;
