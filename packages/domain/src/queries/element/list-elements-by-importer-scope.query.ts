import type { JSONType } from "@cat/shared";

import {
  and,
  contentRelation,
  eq,
  translatableElement,
  vectorizedString,
} from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const ListElementsByImporterScopeQuerySchema = z.object({
  projectId: z.uuidv4(),
  importerId: z.string().min(1),
  sourceRootRef: z.string().min(1),
});

export type ListElementsByImporterScopeQuery = z.infer<
  typeof ListElementsByImporterScopeQuerySchema
>;

export type ElementByImporterScopeRow = {
  id: number;
  projectId: string;
  importerId: string | null;
  sourceRootRef: string | null;
  sourceNodeRef: string | null;
  stableSourceRef: string | null;
  vectorizedStringId: number;
  value: string;
  primaryContentNodeId: string | null;
  localOrder: number | null;
  meta: JSONType | null;
  sourceStartLine: number | null;
  sourceEndLine: number | null;
  sourceLocationMeta: JSONType | null;
};

export const listElementsByImporterScope: Query<
  ListElementsByImporterScopeQuery,
  ElementByImporterScopeRow[]
> = async (ctx, query) => {
  return ctx.db
    .select({
      id: translatableElement.id,
      projectId: translatableElement.projectId,
      importerId: translatableElement.importerId,
      sourceRootRef: translatableElement.sourceRootRef,
      sourceNodeRef: translatableElement.sourceNodeRef,
      stableSourceRef: translatableElement.stableSourceRef,
      vectorizedStringId: translatableElement.vectorizedStringId,
      value: vectorizedString.value,
      primaryContentNodeId: contentRelation.sourceNodeId,
      localOrder: contentRelation.localOrder,
      meta: translatableElement.meta,
      sourceStartLine: translatableElement.sourceStartLine,
      sourceEndLine: translatableElement.sourceEndLine,
      sourceLocationMeta: translatableElement.sourceLocationMeta,
    })
    .from(translatableElement)
    .innerJoin(
      vectorizedString,
      eq(translatableElement.vectorizedStringId, vectorizedString.id),
    )
    .leftJoin(
      contentRelation,
      and(
        eq(contentRelation.targetElementId, translatableElement.id),
        eq(contentRelation.targetEndpointKind, "ELEMENT"),
        eq(contentRelation.isPrimary, true),
      ),
    )
    .where(
      and(
        eq(translatableElement.projectId, query.projectId),
        eq(translatableElement.importerId, query.importerId),
        eq(translatableElement.sourceRootRef, query.sourceRootRef),
      ),
    );
};
