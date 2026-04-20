import * as z from "zod";

import {
  CollectionContextSchema,
  CollectionElementSchema,
} from "@/schema/collection";
import { safeZDotJson } from "@/schema/json";

// --- Extraction Result ---

export const ExtractionMetadataSchema = z.object({
  extractorIds: z.array(z.string()),
  baseDir: z.string(),
  timestamp: z.string(),
});

export const ExtractionResultSchema = z.object({
  elements: z.array(CollectionElementSchema),
  contexts: z.array(CollectionContextSchema).default([]),
  metadata: ExtractionMetadataSchema.optional(),
});

// --- Navigation Step ---

export const NavigationStepSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("click"), selector: z.string() }),
  z.object({
    action: z.literal("fill"),
    selector: z.string(),
    value: z.string(),
  }),
  z.object({ action: z.literal("wait"), ms: z.number() }),
]);

// --- Route Manifest ---

export const RouteEntrySchema = z.object({
  template: z.string(),
  waitAfterLoad: z.number().optional(),
  steps: z.array(NavigationStepSchema).optional(),
  auth: z.boolean().optional(),
});

export const RouteManifestSchema = z.object({
  routes: z.array(RouteEntrySchema),
  bindings: z.record(z.string(), z.string()).optional(),
});

// --- Capture Result ---

export const CaptureScreenshotEntrySchema = z.object({
  filePath: z.string(),
  elementRef: z.string(),
  elementMeta: safeZDotJson,
  route: z.string(),
  highlightRegion: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    })
    .optional(),
});

export const CaptureResultMetadataSchema = z.object({
  baseUrl: z.string(),
  timestamp: z.string(),
});

export const CaptureResultSchema = z.object({
  screenshots: z.array(CaptureScreenshotEntrySchema),
  metadata: CaptureResultMetadataSchema.optional(),
});

// --- Inferred Types ---

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
export type ExtractionMetadata = z.infer<typeof ExtractionMetadataSchema>;
export type NavigationStep = z.infer<typeof NavigationStepSchema>;
export type RouteEntry = z.infer<typeof RouteEntrySchema>;
export type RouteManifest = z.infer<typeof RouteManifestSchema>;
export type CaptureResult = z.infer<typeof CaptureResultSchema>;
export type CaptureScreenshotEntry = z.infer<
  typeof CaptureScreenshotEntrySchema
>;
export type CaptureResultMetadata = z.infer<typeof CaptureResultMetadataSchema>;
