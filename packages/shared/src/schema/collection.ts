import * as z from "zod";

import { TranslatableElementContextTypeSchema } from "@/schema/enum";
import { safeZDotJson } from "@/schema/json";

export { TranslatableElementContextTypeSchema };

// --- Element ---

export const CollectionElementLocationSchema = z.object({
  startLine: z.int().optional(),
  endLine: z.int().optional(),
  custom: z.record(z.string(), z.unknown()).optional(),
});

export const CollectionElementSchema = z.object({
  ref: z.string(),
  text: z.string(),
  meta: safeZDotJson,
  sortIndex: z.int().optional(),
  location: CollectionElementLocationSchema.optional(),
});

// --- Context Data (discriminated union by type) ---

export const CollectionContextDataTextSchema = z.object({
  type: z.literal("TEXT"),
  data: z.object({ text: z.string() }),
});

export const CollectionContextDataJsonSchema = z.object({
  type: z.literal("JSON"),
  data: z.object({ json: safeZDotJson }),
});

export const CollectionContextDataFileSchema = z.object({
  type: z.literal("FILE"),
  data: z.object({ fileId: z.int() }),
});

export const CollectionContextDataMarkdownSchema = z.object({
  type: z.literal("MARKDOWN"),
  data: z.object({ markdown: z.string() }),
});

export const CollectionContextDataUrlSchema = z.object({
  type: z.literal("URL"),
  data: z.object({ url: z.url() }),
});

export const CollectionContextDataImageSchema = z.object({
  type: z.literal("IMAGE"),
  data: z.object({
    fileId: z.int(),
    highlightRegion: z
      .object({
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
      })
      .optional(),
  }),
});

export const CollectionContextDataSchema = z.discriminatedUnion("type", [
  CollectionContextDataTextSchema,
  CollectionContextDataJsonSchema,
  CollectionContextDataFileSchema,
  CollectionContextDataMarkdownSchema,
  CollectionContextDataUrlSchema,
  CollectionContextDataImageSchema,
]);

// --- Context ---

export const CollectionContextSchema = CollectionContextDataSchema.and(
  z.object({
    elementRef: z.string(),
  }),
);

// --- Payload ---

export const CollectionPayloadSchema = z.object({
  projectId: z.uuidv4(),
  sourceLanguageId: z.string(),
  document: z.object({
    name: z.string(),
    fileHandlerId: z.string().optional(),
  }),
  elements: z.array(CollectionElementSchema),
  contexts: z.array(CollectionContextSchema).default([]),
  options: z
    .object({
      branchId: z.int().optional(),
    })
    .optional(),
});

// --- Inferred Types ---

export type CollectionPayload = z.infer<typeof CollectionPayloadSchema>;
export type CollectionElement = z.infer<typeof CollectionElementSchema>;
export type CollectionContext = z.infer<typeof CollectionContextSchema>;
export type CollectionContextData = z.infer<typeof CollectionContextDataSchema>;
export type CollectionElementLocation = z.infer<
  typeof CollectionElementLocationSchema
>;
