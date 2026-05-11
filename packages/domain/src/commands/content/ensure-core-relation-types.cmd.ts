import { and, contentRelationType, eq } from "@cat/db";
import {
  CoreRelationTypeDefinitions,
  type RegisteredRelationTypeInput,
} from "@cat/shared";
import * as z from "zod";

import type { Command } from "@/types";

export const EnsureCoreRelationTypesCommandSchema = z.object({});
export type EnsureCoreRelationTypesCommand = z.infer<
  typeof EnsureCoreRelationTypesCommandSchema
>;

export const ensureCoreRelationTypes: Command<
  EnsureCoreRelationTypesCommand,
  Record<string, number>
> = async (ctx) => {
  const ids: Record<string, number> = {};

  // oxlint-disable-next-line no-await-in-loop
  for (const definition of CoreRelationTypeDefinitions) {
    // oxlint-disable-next-line no-await-in-loop
    const existing = await ctx.db
      .select({ id: contentRelationType.id })
      .from(contentRelationType)
      .where(
        and(
          eq(contentRelationType.namespace, definition.namespace),
          eq(contentRelationType.name, definition.name),
          eq(contentRelationType.version, definition.version),
        ),
      )
      .limit(1);

    if (existing[0]) {
      ids[`${definition.namespace}:${definition.name}:${definition.version}`] =
        existing[0].id;
      continue;
    }

    // oxlint-disable-next-line no-await-in-loop
    const inserted = await ctx.db
      .insert(contentRelationType)
      .values({
        namespace: definition.namespace,
        name: definition.name,
        version: definition.version,
        semanticFamily: definition.semanticFamily,
        allowedEndpointPairs: definition.allowedEndpointPairs,
        directionality: definition.directionality,
        participatesInContainment: definition.participatesInContainment,
        participatesInExport: definition.participatesInExport,
        supportsOrdering: definition.supportsOrdering,
        weightingEligible: definition.weightingEligible,
        defaultTrustLevel: definition.defaultTrustLevel,
        metadata:
          (definition as RegisteredRelationTypeInput).metadata ?? null,
      })
      .returning({ id: contentRelationType.id });

    const row = inserted[0];
    if (!row) throw new Error("Failed to insert core relation type");
    ids[`${definition.namespace}:${definition.name}:${definition.version}`] =
      row.id;
  }

  return { result: ids, events: [] };
};
