import {
  and,
  contentNode,
  contentRelation,
  contentRelationType,
  eq,
} from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared";
import * as z from "zod";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

export const CreateContentNodeUnderParentCommandSchema = z.object({
  projectId: z.uuidv4(),
  creatorId: z.uuidv4().optional(),
  parentContentNodeId: z.uuidv4(),
  kind: z.enum([
    "DIRECTORY",
    "FILE",
    "MARKDOWN_SECTION",
    "SOURCE_COMPONENT",
    "CUSTOM",
  ]),
  displayLabel: z.string().min(1),
  importerId: z.string().min(1),
  sourceRootRef: z.string().min(1),
  stableSourceNodeRef: z.string().min(1),
  sourceUri: z.string().nullable().optional(),
  sourcePath: z.string().nullable().optional(),
  sourceType: z.string().nullable().optional(),
  languageId: z.string().nullable().optional(),
  exportRole: z.enum(["NONE", "DIRECTORY", "FILE", "SECTION"]).default("NONE"),
  boundaryType: z
    .enum(["SOURCE_ROOT", "DIRECTORY", "FILE", "MODULE", "NONE"])
    .default("NONE"),
  fileHandlerId: z.int().nullable().optional(),
  fileId: z.int().nullable().optional(),
  localOrder: z.int().default(0),
});
export type CreateContentNodeUnderParentCommand = z.infer<
  typeof CreateContentNodeUnderParentCommandSchema
>;

export const createContentNodeUnderParent: Command<
  CreateContentNodeUnderParentCommand,
  typeof contentNode.$inferSelect
> = async (ctx, command) => {
  const containsType = assertSingleNonNullish(
    await ctx.db
      .select({ id: contentRelationType.id })
      .from(contentRelationType)
      .where(
        and(
          eq(contentRelationType.namespace, "core"),
          eq(contentRelationType.name, "contains"),
          eq(contentRelationType.version, "1.0.0"),
        ),
      )
      .limit(1),
  );

  const inserted = assertSingleNonNullish(
    await ctx.db
      .insert(contentNode)
      .values({
        projectId: command.projectId,
        creatorId: command.creatorId,
        kind: command.kind,
        displayLabel: command.displayLabel,
        importerId: command.importerId,
        sourceRootRef: command.sourceRootRef,
        stableSourceNodeRef: command.stableSourceNodeRef,
        sourceUri: command.sourceUri ?? null,
        sourcePath: command.sourcePath ?? null,
        sourceType: command.sourceType ?? null,
        languageId: command.languageId ?? null,
        exportRole: command.exportRole,
        boundaryType: command.boundaryType,
        fileHandlerId: command.fileHandlerId ?? null,
        fileId: command.fileId ?? null,
      })
      .returning(),
  );

  await ctx.db.insert(contentRelation).values({
    projectId: command.projectId,
    relationTypeId: containsType.id,
    sourceEndpointKind: "NODE",
    sourceNodeId: command.parentContentNodeId,
    targetEndpointKind: "NODE",
    targetNodeId: inserted.id,
    isPrimary: true,
    localOrder: command.localOrder,
  });

  return {
    result: inserted,
    events: [
      domainEvent("content-node:created", {
        projectId: command.projectId,
        contentNodeId: inserted.id,
      }),
      domainEvent("content-relation:created", {
        projectId: command.projectId,
        sourceContentNodeId: command.parentContentNodeId,
        targetContentNodeId: inserted.id,
      }),
    ],
  };
};
