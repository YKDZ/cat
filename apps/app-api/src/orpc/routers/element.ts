import {
  executeQuery,
  getElementContexts,
  getElementSourceLocation,
  getElementTranslationStatus as getElementTranslationStatusQuery,
} from "@cat/domain";
import { StorageProvider } from "@cat/plugin-core";
import { getDownloadUrl, getServiceFromDBId } from "@cat/server-shared";
import { ElementTranslationStatusSchema } from "@cat/shared";
import { FlattenedContextEvidenceSchema } from "@cat/shared";
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
  .output(z.array(FlattenedContextEvidenceSchema))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { elementId } = input;

    const { contexts } = await executeQuery(
      { db: drizzle },
      getElementContexts,
      { elementId, purpose: "EDITOR" },
    );

    return contexts;
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

export const getTranslationStatus = authed
  .input(
    z.object({
      elementId: z.int(),
      languageId: z.string(),
    }),
  )
  .use(checkElementPermission("viewer"), (i) => i.elementId)
  .output(ElementTranslationStatusSchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    return executeQuery(
      { db: drizzle },
      getElementTranslationStatusQuery,
      input,
    );
  });
