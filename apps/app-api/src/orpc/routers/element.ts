import {
  getDownloadUrl,
  getServiceFromDBId,
} from "@cat/app-server-shared/utils";
import {
  eq,
  translatableElement,
  translatableElementContext,
  document as documentTable,
  file as fileTable,
  blob as blobTable,
  and,
} from "@cat/db";
import { StorageProvider } from "@cat/plugin-core";
import {
  TranslatableElementContextSchema,
  type TranslatableElementContext,
} from "@cat/shared/schema/drizzle/document";
import { safeZDotJson } from "@cat/shared/schema/json";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod";

import { authed } from "@/orpc/server";

export const getContexts = authed
  .input(
    z.object({
      elementId: z.int(),
    }),
  )
  .output(z.array(TranslatableElementContextSchema))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { elementId } = input;

    const { element, contexts } = await drizzle.transaction(async (tx) => {
      const element = assertSingleNonNullish(
        await tx
          .select({
            meta: translatableElement.meta,
            createdAt: translatableElement.createdAt,
            updatedAt: translatableElement.updatedAt,
          })
          .from(translatableElement)
          .where(eq(translatableElement.id, elementId)),
        `Element with ID ${elementId} not found`,
      );

      const contexts = await tx
        .select()
        .from(translatableElementContext)
        .where(eq(translatableElementContext.translatableElementId, elementId));

      return { element, contexts };
    });

    const metaContext = {
      id: -1,
      jsonData: element.meta,
      createdAt: element.createdAt,
      updatedAt: element.updatedAt,
      translatableElementId: elementId,
      type: "JSON",
      fileId: null,
      storageProviderId: null,
      textData: null,
    } satisfies TranslatableElementContext;

    return [metaContext, ...contexts];
  });

export const getSourceLocation = authed
  .input(
    z.object({
      elementId: z.int(),
    }),
  )
  .output(
    z.object({
      fileUrl: z.string().nullable(),
      fileName: z.string().nullable(),
      blobId: z.int().nullable(),
      sourceStartLine: z.int().nullable(),
      sourceEndLine: z.int().nullable(),
      sourceLocationMeta: safeZDotJson.nullable(),
      fileHandlerId: z.int().nullable(),
    }),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      redisDB: { redis },
      pluginManager,
    } = context;
    const { elementId } = input;

    const row = assertSingleNonNullish(
      await drizzle
        .select({
          sourceStartLine: translatableElement.sourceStartLine,
          sourceEndLine: translatableElement.sourceEndLine,
          sourceLocationMeta: translatableElement.sourceLocationMeta,
          fileHandlerId: documentTable.fileHandlerId,
          fileName: fileTable.name,
          blobId: blobTable.id,
          blobKey: blobTable.key,
          storageProviderId: blobTable.storageProviderId,
        })
        .from(translatableElement)
        .innerJoin(
          documentTable,
          eq(documentTable.id, translatableElement.documentId),
        )
        .leftJoin(
          fileTable,
          and(
            eq(fileTable.id, documentTable.fileId),
            eq(fileTable.isActive, true),
          ),
        )
        .leftJoin(blobTable, eq(blobTable.id, fileTable.blobId))
        .where(eq(translatableElement.id, elementId)),
      `Element with ID ${elementId} not found`,
    );

    let fileUrl: string | null = null;
    if (row.blobKey && row.storageProviderId) {
      const provider = getServiceFromDBId<StorageProvider>(
        pluginManager,
        row.storageProviderId,
      );
      fileUrl = await getDownloadUrl(
        redis,
        provider,
        row.storageProviderId,
        row.blobKey,
        120,
      );
    }

    return {
      fileUrl,
      fileName: row.fileName ?? null,
      blobId: row.blobId ?? null,
      sourceStartLine: row.sourceStartLine ?? null,
      sourceEndLine: row.sourceEndLine ?? null,
      sourceLocationMeta: row.sourceLocationMeta ?? null,
      fileHandlerId: row.fileHandlerId ?? null,
    };
  });
