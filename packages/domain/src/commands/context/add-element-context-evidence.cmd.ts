import { contextEvidence, inArray, translatableElement } from "@cat/db";
import {
  ContentEvidenceKindSchema,
  EvidenceTrustLevelSchema,
  safeZDotJson,
} from "@cat/shared";
import * as z from "zod";

import type { Command } from "@/types";

/**
 * Input schema for adding element context evidence.
 */
export const AddElementContextEvidenceCommandSchema = z.object({
  projectId: z.uuidv4(),
  evidence: z.array(
    z.object({
      elementId: z.int(),
      kind: ContentEvidenceKindSchema,
      fileId: z.int().nullable().optional(),
      storageProviderId: z.int().nullable().optional(),
      textData: z.string().nullable().optional(),
      jsonData: safeZDotJson.nullable().optional(),
      displayLabel: z.string().nullable().optional(),
      trustLevel: EvidenceTrustLevelSchema.default("COLLECTED"),
      provenance: safeZDotJson.nullable().optional(),
    }),
  ),
});

/**
 * Command input for adding element context evidence.
 */
export type AddElementContextEvidenceCommand = z.infer<
  typeof AddElementContextEvidenceCommandSchema
>;

export type AddElementContextEvidenceCommandInput = z.input<
  typeof AddElementContextEvidenceCommandSchema
>;

/**
 * Add context evidence rows for elements in bulk.
 */
export const addElementContextEvidence: Command<
  AddElementContextEvidenceCommandInput,
  { addedCount: number }
> = async (ctx, command) => {
  const parsedCommand = AddElementContextEvidenceCommandSchema.parse(command);

  if (parsedCommand.evidence.length === 0) {
    return { result: { addedCount: 0 }, events: [] };
  }

  const elementIds = [
    ...new Set(parsedCommand.evidence.map((item) => item.elementId)),
  ];
  const elementRows = await ctx.db
    .select({
      id: translatableElement.id,
      projectId: translatableElement.projectId,
    })
    .from(translatableElement)
    .where(inArray(translatableElement.id, elementIds));
  const validElementIds = new Set(
    elementRows
      .filter((row) => row.projectId === parsedCommand.projectId)
      .map((row) => row.id),
  );
  const invalidElementIds = elementIds.filter((id) => !validElementIds.has(id));
  if (invalidElementIds.length > 0) {
    throw new Error(
      `Cannot attach context evidence to elements outside project ${parsedCommand.projectId}: ${invalidElementIds.join(", ")}`,
    );
  }

  const rows = await ctx.db
    .insert(contextEvidence)
    .values(
      parsedCommand.evidence.map((item) => ({
        projectId: parsedCommand.projectId,
        attachedEndpointKind: "ELEMENT" as const,
        translatableElementId: item.elementId,
        kind: item.kind,
        trustLevel: item.trustLevel,
        fileId: item.fileId ?? null,
        storageProviderId: item.storageProviderId ?? null,
        textData: item.textData ?? null,
        jsonData: item.jsonData ?? null,
        displayLabel: item.displayLabel ?? null,
        provenance: item.provenance ?? null,
      })),
    )
    .returning({ id: contextEvidence.id });

  return { result: { addedCount: rows.length }, events: [] };
};
