import { addElementContextEvidence, executeCommand } from "@cat/domain";
import {
  finishPresignedPutFile,
  firstOrGivenService,
  preparePresignedPutFile,
} from "@cat/server-shared";
import { sanitizeFileName, StructuredContentPayloadSchema } from "@cat/shared";
import { runGraph, ingestCollectionGraph } from "@cat/workflow/tasks";
import { ORPCError } from "@orpc/client";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import * as z from "zod";

import { authed, checkPermission } from "@/orpc/server";

/**
 * Ingest collection: accept CollectionPayload, run full ingestion pipeline.
 */
export const ingest = authed
  .input(StructuredContentPayloadSchema)
  .use(checkPermission("project", "editor"), (i) => i.projectId)
  .output(
    z.object({
      contentNodeIds: z.array(z.uuidv4()),
      addedCount: z.int(),
      removedCount: z.int(),
      updatedCount: z.int(),
      movedCount: z.int(),
      semanticDiffIds: z.array(z.int()),
    }),
  )
  .handler(async ({ context, input }) => {
    const { pluginManager } = context;

    const vectorStorage = firstOrGivenService(pluginManager, "VECTOR_STORAGE");
    const vectorizer = firstOrGivenService(pluginManager, "TEXT_VECTORIZER");

    if (!vectorStorage || !vectorizer) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "No vectorizer or vector storage provider available",
      });
    }

    const result = await runGraph(ingestCollectionGraph, {
      payload: input,
      vectorizerId: vectorizer.id,
      vectorStorageId: vectorStorage.id,
    });

    return result;
  });

/**
 * Get presigned URL for uploading file-based contexts (screenshots, etc.).
 */
export const prepareUpload = authed
  .input(
    z.object({
      projectId: z.uuidv4(),
      fileName: z.string(),
    }),
  )
  .use(checkPermission("project", "editor"), (i) => i.projectId)
  .output(
    z.object({
      url: z.string(),
      fileId: z.int(),
      putSessionId: z.uuidv4(),
    }),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      sessionStore,
      pluginManager,
    } = context;

    const storage = firstOrGivenService(pluginManager, "STORAGE_PROVIDER");
    if (!storage) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "No storage provider found",
      });
    }

    const name = sanitizeFileName(input.fileName);
    const key = join("collection-uploads", randomUUID() + name);

    const { url, putSessionId, fileId } = await preparePresignedPutFile(
      drizzle,
      sessionStore,
      storage.service,
      storage.id,
      key,
      name,
    );

    return { url, putSessionId, fileId };
  });

/**
 * Finish presigned upload: validate session, compute hash, deduplicate, activate file.
 */
export const finishUpload = authed
  .input(
    z.object({
      projectId: z.uuidv4(),
      putSessionId: z.uuidv4(),
    }),
  )
  .use(checkPermission("project", "editor"), (i) => i.projectId)
  .output(z.object({ fileId: z.int() }))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      sessionStore,
      pluginManager,
    } = context;

    const fileId = await finishPresignedPutFile(
      drizzle,
      sessionStore,
      pluginManager,
      input.putSessionId,
    );

    return { fileId };
  });

const HighlightRegionSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

/**
 * Attach screenshot context evidence to elements.
 */
export const addScreenshotEvidence = authed
  .input(
    z.object({
      projectId: z.uuidv4(),
      screenshots: z.array(
        z.object({
          elementId: z.int(),
          elementRef: z.string().min(1),
          fileId: z.int(),
          route: z.string().min(1),
          highlightRegion: HighlightRegionSchema.optional(),
        }),
      ),
    }),
  )
  .use(checkPermission("project", "editor"), (i) => i.projectId)
  .output(z.object({ addedCount: z.int() }))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    return await executeCommand({ db: drizzle }, addElementContextEvidence, {
      projectId: input.projectId,
      evidence: input.screenshots.map((screenshot) => ({
        elementId: screenshot.elementId,
        kind: "SCREENSHOT" as const,
        fileId: screenshot.fileId,
        jsonData: screenshot.highlightRegion
          ? { highlightRegion: screenshot.highlightRegion }
          : null,
        displayLabel: `screenshot:${screenshot.route}`,
        trustLevel: "COLLECTED" as const,
        provenance: {
          source: "screenshot-collector",
          route: screenshot.route,
          elementRef: screenshot.elementRef,
        },
      })),
    });
  });
