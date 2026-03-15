import * as z from "zod/v4";

/**
 * Metadata attached to an agent session.
 *
 * This is the single source of truth — both the API endpoint and the
 * background worker import from here instead of maintaining duplicates.
 */
export const AgentSessionMetaSchema = z.object({
  projectId: z.string().optional(),
  documentId: z.string().optional(),
  elementId: z.int().optional(),
  /** BCP-47 ID of the target (translation) language */
  languageId: z.string().optional(),
  /** BCP-47 ID of the source language being translated */
  sourceLanguageId: z.string().optional(),
});

export type AgentSessionMeta = z.infer<typeof AgentSessionMetaSchema>;

export const mapSessionMetaToSeeds = (
  metadata: unknown,
): Record<string, string | number | boolean> => {
  const parsed = AgentSessionMetaSchema.safeParse(metadata);
  if (!parsed.success) return {};

  const seeds: Record<string, string | number | boolean> = {};
  const data = parsed.data;

  if (data.projectId) seeds["projectId"] = data.projectId;
  if (data.documentId) seeds["documentId"] = data.documentId;
  if (data.elementId !== undefined) seeds["elementId"] = data.elementId;
  if (data.languageId) {
    seeds["languageId"] = data.languageId;
    seeds["translationLanguageId"] = data.languageId;
  }
  if (data.sourceLanguageId) seeds["sourceLanguageId"] = data.sourceLanguageId;

  return seeds;
};
