import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { Queue, Worker } from "bullmq";
import { fetch } from "undici";
import {
  eq,
  mimeFromFileName,
  pluginService as pluginServiceTable,
  pluginInstallation as pluginInstallationTable,
  task as taskTable,
  translation as translationTable,
  translatableElement as translatableElementTable,
  getSetting,
  and,
  translatableString,
  translationApprovement as translationApprovementTable,
  exists,
} from "@cat/db";
import * as z from "zod/v4";
import { PluginRegistry } from "@cat/plugin-core";
import {
  getDrizzleDB,
  file as fileTable,
  document as documentTable,
} from "@cat/db";
import { assertSingleNonNullish, useStringTemplate } from "@cat/shared/utils";
import { useStorage } from "@cat/app-server-shared/utils";
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
          handlerId: pluginServiceTable.serviceId,
          handlerPluginId: pluginInstallationTable.pluginId,
        })
        .from(documentTable)
        .leftJoin(
          pluginServiceTable,
          eq(documentTable.fileHandlerId, pluginServiceTable.id),
        )
        .leftJoin(
          pluginInstallationTable,
          eq(
            pluginServiceTable.pluginInstallationId,
            pluginInstallationTable.id,
          ),
        )
        .where(eq(documentTable.id, documentId))
        .limit(1),
    );

    if (!document.handlerId || !document.handlerPluginId)
      throw new Error("Document not found");

    const { service: handler } = (await pluginRegistry.getPluginService(
      drizzle,
      document.handlerPluginId,
      "TRANSLATABLE_FILE_HANDLER",
      document.handlerId,
    ))!;

    if (!handler)
      throw new Error(
        `Translatable File Handler with id ${document.handlerId} do not exists`,
      );

    const file = assertSingleNonNullish(
      await drizzle
        .select({
          originName: fileTable.originName,
          storedPath: fileTable.storedPath,
        })
        .from(fileTable)
        .where(eq(fileTable.documentId, documentId))
        .limit(1),
    );

    if (!file) throw new Error(`Document with id ${documentId} do not exists`);

    // TODO 配置
    const { id, provider } = await useStorage(
      drizzle,
      "s3-storage-provider",
      "S3",
      "GLOBAL",
      "",
    );
    const fileContent = await provider.getContent(file.storedPath);

    // drizzle 查询 translation 及关联 TranslatableElement、Approvements
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
      fileName: file.originName,
    });
    const storedPath = join(provider.getBasicPath(), path);

    const translatedFile = assertSingleNonNullish(
      await drizzle
        .insert(fileTable)
        .values([
          {
            storedPath: storedPath,
            originName: file.originName,
            storageProviderId: id,
          },
        ])
        .returning({ id: fileTable.id }),
    );

    const uploadURL = await provider.generateUploadURL(storedPath, 60);

    const response = await fetch(uploadURL, {
      method: "PUT",
      headers: {
        "Content-Type": await mimeFromFileName(drizzle, file.originName),
      },
      body: new Uint8Array(translated),
      mode: "cors",
      credentials: "omit",
    });

    if (!response.ok) {
      throw new Error(
        `Upload translated file failed: ${response.status} ${response.statusText}`,
      );
    }

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
          meta: { ...task.meta, fileId: translatedFile.id, storedPath },
        })
        .where(eq(taskTable.id, taskId));
    });
  },
  {
    ...config,
    concurrency: 50,
  },
);

registerTaskUpdateHandlers(drizzle, worker, queueId);

export const exportTranslatedFileWorker = worker;
