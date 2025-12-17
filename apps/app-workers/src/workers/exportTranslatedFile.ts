import { randomUUID } from "node:crypto";
import {
  eq,
  task as taskTable,
  translation as translationTable,
  translatableElement as translatableElementTable,
  getSetting,
  and,
  translatableString,
  translationApprovement as translationApprovementTable,
  exists,
  blob as blobTable,
  getDrizzleDB,
  file as fileTable,
  document as documentTable,
  sql,
} from "@cat/db";
import * as z from "zod/v4";
import {
  PluginRegistry,
  type StorageProvider,
  type TranslatableFileHandler,
} from "@cat/plugin-core";
import { assertSingleNonNullish, useStringTemplate } from "@cat/shared/utils";
import {
  getServiceFromDBId,
  putBufferToStorage,
  readableToBuffer,
  useStorage,
} from "@cat/app-server-shared/utils";
import { defineWorker } from "@/utils";
import type { JSONType } from "@cat/shared/schema/json";

const { client: drizzle } = await getDrizzleDB();

const id = "export-translated-file";

declare module "../core/registry" {
  interface WorkerInputTypeMap {
    [id]: ExportTranslatedFileInput;
  }
}

const ExportTranslatedFileInputSchema = z.object({
  taskId: z.uuidv7(),
  documentId: z.string(),
  languageId: z.string(),
});

type ExportTranslatedFileInput = z.infer<
  typeof ExportTranslatedFileInputSchema
>;

/**
 * 获取文档的文件信息
 */
async function getDocumentFileInfo(documentId: string): Promise<{
  fileId: number;
  fileHandlerId: number;
  fileName: string;
  fileKey: string;
  storageProviderId: number;
}> {
  const document = assertSingleNonNullish(
    await drizzle
      .select({
        fileId: documentTable.fileId,
        fileHandlerId: documentTable.fileHandlerId,
      })
      .from(documentTable)
      .where(eq(documentTable.id, documentId))
      .limit(1),
    `Document ${documentId} not found`,
  );

  if (!document.fileHandlerId || !document.fileId) {
    throw new Error("Document is not file based");
  }

  const file = assertSingleNonNullish(
    await drizzle
      .select({
        name: fileTable.name,
        key: blobTable.key,
        storageProviderId: blobTable.storageProviderId,
      })
      .from(fileTable)
      .innerJoin(blobTable, eq(fileTable.blobId, blobTable.id))
      .where(
        and(eq(fileTable.id, document.fileId), eq(fileTable.isActive, true)),
      ),
    `Document ${documentId} does not have an active file`,
  );

  return {
    fileId: document.fileId,
    fileHandlerId: document.fileHandlerId,
    fileName: file.name,
    fileKey: file.key,
    storageProviderId: file.storageProviderId,
  };
}

/**
 * 获取文件处理器
 */
async function getFileHandler(
  fileHandlerId: number,
): Promise<TranslatableFileHandler> {
  const pluginRegistry = PluginRegistry.get("GLOBAL", "");

  const handler = await getServiceFromDBId<TranslatableFileHandler>(
    drizzle,
    pluginRegistry,
    fileHandlerId,
  );

  if (!handler) {
    throw new Error(
      `Translatable File Handler with id ${fileHandlerId} does not exist`,
    );
  }

  return handler;
}

/**
 * 获取已批准的翻译数据
 */
async function getApprovedTranslations(
  documentId: string,
  languageId: string,
): Promise<Array<{ value: string; meta: JSONType }>> {
  return await drizzle
    .select({
      value: translatableString.value,
      meta: translatableElementTable.meta,
    })
    .from(translationTable)
    .innerJoin(
      translatableString,
      eq(translationTable.stringId, translatableString.id),
    )
    .innerJoin(
      translatableElementTable,
      eq(translationTable.translatableElementId, translatableElementTable.id),
    )
    .where(
      and(
        eq(translatableString.languageId, languageId),
        eq(translatableElementTable.documentId, documentId),
        exists(
          drizzle
            .select({ id: translationApprovementTable.id })
            .from(translationApprovementTable)
            .where(
              and(
                eq(
                  translationApprovementTable.translationId,
                  translationTable.id,
                ),
                eq(translationApprovementTable.isActive, true),
              ),
            ),
        ),
      ),
    );
}

/**
 * 从存储中读取文件内容
 */
async function readFileContent(
  fileKey: string,
  storageProviderId: number,
): Promise<Buffer> {
  const pluginRegistry = PluginRegistry.get("GLOBAL", "");

  const provider = await getServiceFromDBId<StorageProvider>(
    drizzle,
    pluginRegistry,
    storageProviderId,
  );

  return await readableToBuffer(await provider.getStream(fileKey));
}

/**
 * 上传翻译后的文件
 */
async function uploadTranslatedFile(
  file: Buffer,
  name: string,
  documentId: string,
  languageId: string,
): Promise<{ fileId: number }> {
  const { id: storageProviderId, provider } = await useStorage(
    drizzle,
    "s3-storage-provider",
    "S3",
    "GLOBAL",
    "",
  );

  const uuid = randomUUID();
  const date = new Date();
  const template = await getSetting(
    drizzle,
    "storage.template.exported-translated-file",
    "exported/document/translated/{year}/{month}/{date}/{uuid}-{languageId}-{fileName}",
  );

  const path = useStringTemplate(template, {
    date,
    documentId,
    languageId,
    uuid,
    fileName: name,
  });

  return await putBufferToStorage(
    drizzle,
    provider,
    storageProviderId,
    file,
    path,
    name,
  );
}

const exportTranslatedFileWorker = defineWorker({
  id,
  inputSchema: ExportTranslatedFileInputSchema,

  async execute(ctx) {
    const { documentId, languageId, taskId } = ctx.input;

    const fileInfo = await getDocumentFileInfo(documentId);

    const handler = await getFileHandler(fileInfo.fileHandlerId);

    const fileContent = await readFileContent(
      fileInfo.fileKey,
      fileInfo.storageProviderId,
    );

    const translations = await getApprovedTranslations(documentId, languageId);

    const translatedContent = await handler.getReplacedFileContent(
      fileContent,
      translations.map(({ value, meta }) => ({ value, meta })),
    );

    const { fileId: translatedFileId } = await uploadTranslatedFile(
      translatedContent,
      fileInfo.fileName,
      documentId,
      languageId,
    );

    const data = {
      translatedFileId,
      translationCount: translations.length,
      originalFileName: fileInfo.fileName,
    };

    await drizzle
      .update(taskTable)
      .set({
        status: "COMPLETED",
        meta: sql`${taskTable.meta} || ${data}::jsonb`,
      })
      .where(eq(taskTable.id, taskId));

    return data;
  },

  hooks: {
    onFailed: async (ctx) => {
      await drizzle
        .update(taskTable)
        .set({
          status: "FAILED",
        })
        .where(eq(taskTable.id, ctx.data.taskId));
    },
  },
});

export default {
  workers: { exportTranslatedFileWorker },
} as const;
