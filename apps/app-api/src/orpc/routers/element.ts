import {
  executeQuery,
  getElementContexts,
  getElementSourceLocation,
} from "@cat/domain";
import { StorageProvider } from "@cat/plugin-core";
import { getDownloadUrl, getServiceFromDBId } from "@cat/server-shared";
import {
  TranslatableElementContextSchema,
  type TranslatableElementContext,
} from "@cat/shared";
import { safeZDotJson } from "@cat/shared";
import * as z from "zod";

import { authed, checkElementPermission } from "@/orpc/server";

export const getContexts = authed
  .input(
    z.object({
      elementId: z.int(),
    }),
  )
  .use(checkElementPermission("viewer"), (i) => i.elementId)
  .output(z.array(TranslatableElementContextSchema))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { elementId } = input;

    const { element, contexts } = await executeQuery(
      { db: drizzle },
      getElementContexts,
      { elementId },
    );

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
  .use(checkElementPermission("viewer"), (i) => i.elementId)
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
      sessionStore,
      pluginManager,
    } = context;
    const { elementId } = input;

    const row = await executeQuery({ db: drizzle }, getElementSourceLocation, {
      elementId,
    });

    let fileUrl: string | null = null;
    if (row.blobKey && row.storageProviderId) {
      const provider = getServiceFromDBId<StorageProvider>(
        pluginManager,
        row.storageProviderId,
      );
      fileUrl = await getDownloadUrl(
        sessionStore,
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
