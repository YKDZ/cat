import { randomUUID } from "node:crypto";
import { Queue, Worker } from "bullmq";
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
} from "@cat/db";
import * as z from "zod/v4";
import {
  PluginRegistry,
  StorageProvider,
  TranslatableFileHandler,
} from "@cat/plugin-core";
import {
  getDrizzleDB,
  file as fileTable,
  document as documentTable,
} from "@cat/db";
import { assertSingleNonNullish, useStringTemplate } from "@cat/shared/utils";
import {
  getServiceFromDBId,
  putBufferToStorage,
  readableToBuffer,
  useStorage,
} from "@cat/app-server-shared/utils";
import { config } from "./config.ts";
import { registerTaskUpdateHandlers } from "@/utils/worker.ts";

const { client: drizzle } = await getDrizzleDB();

const queueId = "exportTranslatedFile";

export const exportTranslatedFileQueue = new Queue(queueId, config);

const worker = new Worker(
  queueId,
  async (job) => {
    const { documentId, languageId } = z
      .object({
        documentId: z.string(),
        languageId: z.string(),
      })
      .parse(job.data);
    const taskId = z.string().parse(job.id);
    const pluginRegistry = PluginRegistry.get("GLOBAL", "");

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

    if (!document.fileHandlerId || !document.fileId)
      throw new Error("Document is not file based");

    const handler = await getServiceFromDBId<TranslatableFileHandler>(
      drizzle,
      pluginRegistry,
      document.fileHandlerId,
    );

    if (!handler)
      throw new Error(
        `Translatable File Handler with id ${document.fileHandlerId} do not exists`,
      );

    const file = assertSingleNonNullish(
      await drizzle
        .select({
          name: fileTable.name,
          key: blobTable.key,
          storageProviderId: blobTable.storageProviderId,
        })
        .from(fileTable)
        .where(
          and(eq(fileTable.id, document.fileId), eq(fileTable.isActive, true)),
        ),
      `Document ${documentId} not have file`,
    );

    const provider = await getServiceFromDBId<StorageProvider>(
      drizzle,
      pluginRegistry,
      file.storageProviderId,
    );
    const fileContent = await readableToBuffer(
      await provider.getStream(file.key),
    );

    // 查询所有已被批准的翻译
    const translationData = await drizzle
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

    const translated = await handler.getReplacedFileContent(
      fileContent,
      translationData.map(({ value, meta }) => ({
        value,
        meta: z.json().parse(meta),
      })),
    );

    const { fileId: translatedFileId } = await uploadTranslatedFile(
      translated,
      file.name,
      documentId,
      languageId,
    );

    await drizzle.transaction(async (tx) => {
      const [task] = await tx
        .select()
        .from(taskTable)
        .where(eq(taskTable.id, taskId));

      if (!task) throw new Error("Task do not exists");
      if (typeof task.meta !== "object") throw new Error("Task has wrong meta");

      await tx
        .update(taskTable)
        .set({
          meta: { ...task.meta, fileId: translatedFileId },
        })
        .where(eq(taskTable.id, taskId));
    });
  },
  {
    ...config,
    concurrency: 50,
  },
);

const uploadTranslatedFile = async (
  file: Buffer,
  name: string,
  documentId: string,
  languageId: string,
) => {
  // TODO 配置 storage
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
};

registerTaskUpdateHandlers(drizzle, worker, queueId);

export const exportTranslatedFileWorker = worker;
