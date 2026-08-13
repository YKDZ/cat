import * as z from "zod";

import { GlossaryListSortSchema } from "#/queries/glossary/list-glossaries-by-creator.query.ts";
import { MemoryListSortSchema } from "#/queries/memory/list-memories-by-creator.query.ts";
import { ProjectListSortSchema } from "#/queries/project/list-accessible-projects.query.ts";

const pagedListByCreatorShape = {
  creatorId: z.uuidv4(),
  pageIndex: z.int().min(0),
  pageSize: z.int().min(1).max(100),
};

export const ProjectListByCreatorCapabilityInputSchema = z.strictObject({
  ...pagedListByCreatorShape,
  sort: ProjectListSortSchema.optional(),
});

export const MemoryListByCreatorCapabilityInputSchema = z.strictObject({
  ...pagedListByCreatorShape,
  search: z.string().trim().min(1).optional(),
  sort: MemoryListSortSchema.optional(),
});

export const GlossaryListByCreatorCapabilityInputSchema = z.strictObject({
  ...pagedListByCreatorShape,
  search: z.string().trim().min(1).optional(),
  sort: GlossaryListSortSchema.optional(),
});

export type ProjectListByCreatorCapabilityInput = z.infer<
  typeof ProjectListByCreatorCapabilityInputSchema
>;
export type MemoryListByCreatorCapabilityInput = z.infer<
  typeof MemoryListByCreatorCapabilityInputSchema
>;
export type GlossaryListByCreatorCapabilityInput = z.infer<
  typeof GlossaryListByCreatorCapabilityInputSchema
>;
