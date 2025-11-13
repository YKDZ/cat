import { join } from "node:path";
import { TRPCError } from "@trpc/server";
import * as z from "zod/v4";
import {
  sanitizeFileName,
  translatableElement as translatableElementTable,
  document as documentTable,
  documentVersion as documentVersionTable,
  file as fileTable,
  task as taskTable,
  documentToTask as documentToTaskTable,
  translation as translationTable,
  translationApprovement as translationApprovementTable,
  eq,
  exists,
  and,
  count,
  asc,
  gt,
  lt,
  ilike,
  not,
  DrizzleClient,
  translatableString,
  getTableColumns,
  blob as blobTable,
  inArray,
} from "@cat/db";

import {
  ElementTranslationStatusSchema,
  FileMetaSchema,
} from "@cat/shared/schema/misc";
import {
  DocumentSchema,
  DocumentVersionSchema,
  TranslatableElementSchema,
} from "@cat/shared/schema/drizzle/document";
import {
  createDocumentUnderParent,
  finishPresignedPutFile,
  getServiceFromDBId,
  preparePresignedPutFile,
  useStorage,
} from "@cat/app-server-shared/utils";
import { assertSingleNonNullish } from "@cat/shared/utils";
import { authedProcedure, router } from "@/trpc/server.ts";
import { StorageProvider } from "@cat/plugin-core";
import { randomUUID } from "node:crypto";

/**
 * 构建翻译状态查询条件
 * @param drizzle - Drizzle 数据库实例
 * @param isTranslated - 是否已翻译
 * @param isApproved - 是否已审批
 * @returns 翻译状态查询条件数组
 */
function buildTranslationStatusConditions(
  drizzle: DrizzleClient,
  isTranslated?: boolean,
  isApproved?: boolean,
  languageId?: string,
) {
  const conditions = [];

  if (isTranslated === undefined && isApproved === undefined) return [];
  if (!languageId)
    throw new Error(
      "languageId must be provided when isApproved or isTranslated is set",
    );
  if (isTranslated === false && isApproved === true)
    throw new Error("isTranslated must be true when isApproved is set");

  if (isTranslated === false && isApproved === undefined) {
    // 没有翻译
    conditions.push(
      not(
        exists(
          drizzle
            .select()
            .from(translationTable)
            .innerJoin(
              translatableString,
              eq(translationTable.stringId, translatableString.id),
            )
            .where(
              and(
                eq(
                  translationTable.translatableElementId,
                  translatableElementTable.id,
                ),
                eq(translatableString.languageId, languageId),
              ),
            ),
        ),
      ),
    );
  } else if (isTranslated === true && isApproved === undefined) {
    // 有翻译
    conditions.push(
      exists(
        drizzle
          .select()
          .from(translationTable)
          .innerJoin(
            translatableString,
            eq(translationTable.stringId, translatableString.id),
          )
          .where(
            and(
              eq(
                translationTable.translatableElementId,
                translatableElementTable.id,
              ),
              eq(translatableString.languageId, languageId),
            ),
          ),
      ),
    );
  } else if (isTranslated === true && isApproved === false) {
    // 有翻译但未审批
    conditions.push(
      exists(
        drizzle
          .select()
          .from(translationTable)
          .innerJoin(
            translatableString,
            eq(translationTable.stringId, translatableString.id),
          )
          .where(
            and(
              eq(
                translationTable.translatableElementId,
                translatableElementTable.id,
              ),
              eq(translatableString.languageId, languageId),
              not(
                exists(
                  drizzle
                    .select()
                    .from(translationApprovementTable)
                    .where(
                      eq(
                        translationApprovementTable.translationId,
                        translationTable.id,
                      ),
                    ),
                ),
              ),
            ),
          ),
      ),
    );
  } else if (isTranslated === true && isApproved === true) {
    // 有翻译且已审批
    conditions.push(
      exists(
        drizzle
          .select()
          .from(translationTable)
          .innerJoin(
            translatableString,
            eq(translationTable.stringId, translatableString.id),
          )
          .where(
            and(
              eq(
                translationTable.translatableElementId,
                translatableElementTable.id,
              ),
              eq(translatableString.languageId, languageId),
              exists(
                drizzle
                  .select()
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
          ),
      ),
    );
  }

  return conditions;
}

export const documentRouter = router({
  prepareCreateFromFile: authedProcedure
    .input(
      z.object({
        meta: FileMetaSchema,
      }),
    )
    .output(
      z.object({
        url: z.url(),
        fileId: z.int(),
        putSessionId: z.uuidv4(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
        redisDB: { redis },
      } = ctx;
      const { meta } = input;

      // TODO 配置 storage
      const { id: providerId, provider } = await useStorage(
        drizzle,
        "s3-storage-provider",
        "S3",
        "GLOBAL",
        "",
      );

      const name = sanitizeFileName(meta.name);
      const key = join("documents", randomUUID() + name);

      const { url, putSessionId, fileId } = await preparePresignedPutFile(
        drizzle,
        redis,
        provider,
        providerId,
        key,
        name,
      );

      return {
        url,
        putSessionId,
        fileId,
      };
    }),
  finishCreateFromFile: authedProcedure
    .input(
      z.object({
        languageId: z.string(),
        projectId: z.string(),
        putSessionId: z.uuidv4(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { projectId, putSessionId, languageId } = input;
      const {
        drizzleDB: { client: drizzle },
        redisDB: { redis },
        user,
        pluginRegistry,
        workerRegistry,
      } = ctx;

      const dbProject = await drizzle.query.project.findFirst({
        where: (project, { eq }) => eq(project.id, projectId),
        columns: {
          id: true,
        },
      });

      if (!dbProject)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Project ${projectId} not found`,
        });

      const fileId = await finishPresignedPutFile(
        drizzle,
        redis,
        pluginRegistry,
        putSessionId,
      );

      const { fileName } = assertSingleNonNullish(
        await drizzle
          .select({ fileName: fileTable.name })
          .from(fileTable)
          .where(and(eq(fileTable.id, fileId), eq(fileTable.isActive, true))),
      );

      // 名称相同则视为重复文档
      const existDocumentRows = await drizzle
        .select({
          id: documentTable.id,
        })
        .from(documentTable)
        .where(
          and(
            eq(documentTable.projectId, projectId),
            eq(documentTable.name, fileName),
            eq(documentTable.isDirectory, false),
          ),
        )
        .limit(1);

      if (existDocumentRows.length === 0) {
        const service = pluginRegistry
          .getPluginServices("TRANSLATABLE_FILE_HANDLER")
          .find(({ service }) => service.canExtractElement(fileName));

        if (!service)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "No suitable file handler found for this file",
          });

        const result = await drizzle.transaction(async (tx) => {
          // 创建文档
          const document = await createDocumentUnderParent(tx, {
            creatorId: user.id,
            projectId,
            fileHandlerId: await pluginRegistry.getPluginServiceDbId(
              drizzle,
              service.record,
            ),
            name: fileName,
          });

          // 更新文档关联到文件
          await tx
            .update(documentTable)
            .set({ fileId: fileId })
            .where(eq(documentTable.id, document.id));

          // 创建文档版本
          await tx.insert(documentVersionTable).values({
            documentId: document.id,
          });

          // 创建任务
          const task = assertSingleNonNullish(
            await tx
              .insert(taskTable)
              .values({
                type: "upsertDocumentElementsFromFile",
                meta: {
                  projectId,
                },
              })
              .returning({
                id: documentTable.id,
              }),
          );

          // 关联文档和任务
          await tx.insert(documentToTaskTable).values({
            documentId: document.id,
            taskId: task.id,
          });

          return { document, task };
        });

        await workerRegistry.executeFlow(
          "upsert-document-elements-from-file",
          {
            documentId: result.document.id,
            fileId,
            languageId,
          },
          {
            jobId: result.task.id,
          },
        );
      } else {
        const existDocument = assertSingleNonNullish(existDocumentRows);

        const task = assertSingleNonNullish(
          await drizzle
            .insert(taskTable)
            .values({
              type: "upsertDocumentElementsFromFile",
              meta: { projectId },
            })
            .returning({ id: taskTable.id }),
        );

        // 关联文档和任务
        await drizzle.insert(documentToTaskTable).values({
          documentId: existDocument.id,
          taskId: task.id,
        });

        await workerRegistry.executeFlow(
          "upsert-document-elements-from-file",
          {
            documentId: existDocument.id,
            fileId,
            languageId,
          },
          {
            jobId: task.id,
          },
        );
      }
    }),
  get: authedProcedure
    .input(z.object({ id: z.string() }))
    .output(DocumentSchema.nullable())
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { id } = input;

      const document = await drizzle.query.document.findFirst({
        where: (document, { eq }) => eq(document.id, id),
      });

      return document ?? null;
    }),
  countElement: authedProcedure
    .input(
      z.object({
        documentId: z.string(),
        searchQuery: z.string().default(""),
        isApproved: z.boolean().optional(),
        isTranslated: z.boolean().optional(),
        languageId: z.string().optional(),
      }),
    )
    .output(z.number().int().min(0))
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { documentId, searchQuery, isApproved, isTranslated, languageId } =
        input;

      const whereConditions = [
        eq(translatableElementTable.documentId, documentId),
      ];

      if (searchQuery.trim().length !== 0) {
        whereConditions.push(
          ilike(translatableString.value, `%${searchQuery}%`),
        );
      }

      if (isTranslated || isApproved)
        whereConditions.push(
          ...buildTranslationStatusConditions(
            drizzle,
            isTranslated,
            isApproved,
            languageId,
          ),
        );

      return assertSingleNonNullish(
        await drizzle
          .select({ count: count() })
          .from(translatableElementTable)
          .innerJoin(
            translatableString,
            eq(
              translatableElementTable.translatableStringId,
              translatableString.id,
            ),
          )
          .where(
            whereConditions.length === 1
              ? whereConditions[0]
              : and(...whereConditions),
          ),
      ).count;
    }),
  queryFirstElement: authedProcedure
    .input(
      z.object({
        documentId: z.string(),
        searchQuery: z.string().default(""),
        greaterThan: z.number().int().optional(),
        isApproved: z.boolean().optional(),
        isTranslated: z.boolean().optional(),
        languageId: z.string().optional(),
      }),
    )
    .output(TranslatableElementSchema.nullable())
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const {
        documentId,
        searchQuery,
        greaterThan,
        isApproved,
        isTranslated,
        languageId,
      } = input;

      const whereConditions = [
        eq(translatableElementTable.documentId, documentId),
      ];

      if (searchQuery.trim().length !== 0) {
        whereConditions.push(
          ilike(translatableString.value, `%${searchQuery}%`),
        );
      }

      if (greaterThan !== undefined) {
        whereConditions.push(
          gt(translatableElementTable.sortIndex, greaterThan),
        );
      }

      // 添加翻译状态条件
      whereConditions.push(
        ...buildTranslationStatusConditions(
          drizzle,
          isTranslated,
          isApproved,
          languageId,
        ),
      );

      const element = await drizzle
        .select(getTableColumns(translatableElementTable))
        .from(translatableElementTable)
        .where(
          whereConditions.length === 1
            ? whereConditions[0]
            : and(...whereConditions),
        )
        .innerJoin(
          translatableString,
          eq(
            translatableElementTable.translatableStringId,
            translatableString.id,
          ),
        )
        .orderBy(asc(translatableElementTable.sortIndex))
        .limit(1);

      return element[0] ?? null;
    }),
  exportTranslatedFile: authedProcedure
    .input(
      z.object({
        documentId: z.string(),
        languageId: z.string(),
      }),
    )
    .output(z.void())
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
        workerRegistry,
      } = ctx;
      const { documentId, languageId } = input;

      const document = assertSingleNonNullish(
        await drizzle
          .select({
            fileHandlerId: documentTable.fileHandlerId,
            fileId: documentTable.fileId,
            projectId: documentTable.projectId,
          })
          .from(documentTable)
          .where(eq(documentTable.id, documentId)),
        `Document ${documentId} not found`,
      );

      if (!document.fileId || !document.fileHandlerId)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "指定文档不是基于文件的",
        });

      const task = assertSingleNonNullish(
        await drizzle
          .insert(taskTable)
          .values({
            type: "export_translated_file",
            meta: {
              projectId: document.projectId,
              documentId,
              languageId,
            },
          })
          .returning({ id: taskTable.id }),
      );

      await workerRegistry.addJob(
        "export-translated-file",
        {
          documentId,
          languageId,
        },
        {
          jobId: task.id,
        },
      );
    }),
  getTranslatedFilePresignedUrl: authedProcedure
    .input(
      z.object({
        taskId: z.uuidv7(),
        expiresIn: z.int().max(120).default(120),
      }),
    )
    .output(
      z.object({
        fileName: z.string(),
        url: z.url(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
        pluginRegistry,
      } = ctx;
      const { taskId } = input;

      const task = await drizzle.query.task.findFirst({
        where: (task, { and, eq }) =>
          and(eq(task.type, "export_translated_file"), eq(task.id, taskId)),
        orderBy: (task, { desc }) => desc(task.createdAt),
      });

      if (!task)
        throw new TRPCError({
          message: "Do not find export task for this document and language",
          code: "BAD_REQUEST",
        });
      if (task.status !== "COMPLETED")
        throw new TRPCError({
          message:
            task.status === "FAILED"
              ? "Task failed. Please retry or check console log"
              : "Do not find export task for this document and language",
          code: "BAD_REQUEST",
        });

      const { fileId } = z.object({ fileId: z.int() }).parse(task.meta);

      const file = assertSingleNonNullish(
        await drizzle
          .select({
            name: fileTable.name,
            key: blobTable.key,
            storageProviderId: blobTable.storageProviderId,
          })
          .from(fileTable)
          .innerJoin(blobTable, eq(fileTable.blobId, blobTable.id))
          .where(and(eq(fileTable.id, fileId), eq(fileTable.isActive, true))),
        `File ${fileId} not found`,
      );

      if (!file)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "File does not exists",
        });

      const provider = await getServiceFromDBId<StorageProvider>(
        drizzle,
        pluginRegistry,
        file.storageProviderId,
      );

      const url = await provider.getPresignedGetUrl(file.key, 60, file.name);

      return {
        url,
        fileName: file.name,
      };
    }),
  queryElementTranslationStatus: authedProcedure
    .input(
      z.object({
        elementId: z.number(),
        languageId: z.string(),
      }),
    )
    .output(ElementTranslationStatusSchema)
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { elementId, languageId } = input;

      const element = await drizzle.query.translatableElement.findFirst({
        where: (element, { eq }) => eq(element.id, elementId),
      });

      if (!element)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "指定元素不存在",
        });

      // 查询该元素在指定语言下的翻译
      const translations = await drizzle
        .select({
          id: translationTable.id,
        })
        .from(translationTable)
        .innerJoin(
          translatableString,
          eq(translationTable.stringId, translatableString.id),
        )
        .where(
          and(
            eq(translationTable.translatableElementId, elementId),
            eq(translatableString.languageId, languageId),
          ),
        );

      if (translations.length === 0) {
        return "NO";
      }

      // 检查是否有活跃的审批
      const activeApprovementAmount = await drizzle
        .select({ id: translationApprovementTable.id })
        .from(translationApprovementTable)
        .where(
          and(
            eq(translationApprovementTable.isActive, true),
            inArray(
              translationApprovementTable.translationId,
              translations.map((t) => t.id),
            ),
          ),
        )
        .limit(1);

      if (activeApprovementAmount.length > 0) {
        return "APPROVED";
      }

      return "TRANSLATED";
    }),
  queryElements: authedProcedure
    .input(
      z.object({
        documentId: z.string(),
        page: z.number().int().int().default(0),
        pageSize: z.number().int().int().default(16),
        searchQuery: z.string().default(""),
        isApproved: z.boolean().optional(),
        isTranslated: z.boolean().optional(),
        languageId: z.string().optional(),
      }),
    )
    .output(
      z.array(
        TranslatableElementSchema.extend({
          value: z.string(),
          languageId: z.string(),
        }),
      ),
    )
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const {
        documentId,
        page,
        pageSize,
        searchQuery,
        isApproved,
        isTranslated,
        languageId,
      } = input;

      if (isApproved !== undefined && isTranslated !== true) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "isTranslated must be true when isApproved is set",
        });
      }

      const whereConditions = [
        eq(translatableElementTable.documentId, documentId),
      ];

      if (searchQuery?.trim().length !== 0) {
        whereConditions.push(
          ilike(translatableString.value, `%${searchQuery}%`),
        );
      }

      // 添加翻译状态条件
      whereConditions.push(
        ...buildTranslationStatusConditions(
          drizzle,
          isTranslated,
          isApproved,
          languageId,
        ),
      );

      const result = await drizzle
        .select({
          ...getTableColumns(translatableElementTable),
          value: translatableString.value,
          languageId: translatableString.languageId,
        })
        .from(translatableElementTable)
        .where(
          whereConditions.length === 1
            ? whereConditions[0]
            : and(...whereConditions),
        )
        .innerJoin(
          translatableString,
          eq(
            translatableElementTable.translatableStringId,
            translatableString.id,
          ),
        )
        .orderBy(asc(translatableElementTable.sortIndex))
        .limit(pageSize)
        .offset(page * pageSize);

      return result;
    }),
  queryPageIndexOfElement: authedProcedure
    .input(
      z.object({
        elementId: z.number(),
        documentId: z.string(),
        pageSize: z.number().int().default(16),
        searchQuery: z.string().default(""),
        isApproved: z.boolean().optional(),
        isTranslated: z.boolean().optional(),
        languageId: z.string().optional(),
      }),
    )
    .output(z.number().int())
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;

      const {
        elementId,
        documentId,
        pageSize,
        searchQuery,
        isApproved,
        isTranslated,
        languageId,
      } = input;

      if (isApproved !== undefined && isTranslated !== true) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "isTranslated must be true when isApproved is set",
        });
      }

      const target = await drizzle.query.translatableElement.findFirst({
        where: (element, { eq }) => eq(element.id, elementId),
        columns: {
          sortIndex: true,
        },
      });

      if (!target)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Element with given id does not exists",
        });

      const whereConditions = [
        eq(translatableElementTable.documentId, documentId),
        lt(translatableElementTable.sortIndex, target.sortIndex),
      ];

      if (searchQuery.trim().length !== 0) {
        whereConditions.push(
          ilike(translatableString.value, `%${searchQuery}%`),
        );
      }

      // 添加翻译状态条件
      whereConditions.push(
        ...buildTranslationStatusConditions(
          drizzle,
          isTranslated,
          isApproved,
          languageId,
        ),
      );

      const result = await drizzle
        .select({ count: count() })
        .from(translatableElementTable)
        .innerJoin(
          translatableString,
          eq(
            translatableElementTable.translatableStringId,
            translatableString.id,
          ),
        )
        .where(and(...whereConditions));

      return Math.floor(result[0].count / pageSize);
    }),
  delete: authedProcedure
    .input(
      z.object({
        id: z.uuidv7(),
      }),
    )
    .output(z.void())
    .mutation(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { id } = input;

      await drizzle.delete(documentTable).where(eq(documentTable.id, id));
    }),
  getDocumentVersions: authedProcedure
    .input(
      z.object({
        documentId: z.uuidv7(),
      }),
    )
    .output(z.array(DocumentVersionSchema))
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { documentId } = input;

      return await drizzle.query.documentVersion.findMany({
        where: (version, { eq }) => eq(version.documentId, documentId),
        orderBy: (version, { desc }) => desc(version.createdAt),
      });
    }),
  getDocumentFileUrl: authedProcedure
    .input(
      z.object({
        documentId: z.uuidv7(),
        documentVersionId: z.number().int().optional(),
      }),
    )
    .output(z.url().nullable())
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
        pluginRegistry,
      } = ctx;
      const { documentId, documentVersionId } = input;

      const whereConditions = [eq(documentTable.id, documentId)];

      if (documentVersionId) {
        whereConditions.push(
          exists(
            drizzle
              .select()
              .from(documentVersionTable)
              .where(
                and(
                  eq(documentVersionTable.documentId, documentId),
                  eq(documentVersionTable.id, documentVersionId),
                ),
              ),
          ),
        );
      }

      const { key, storageProviderId } = (
        await drizzle
          .select({
            key: blobTable.key,
            storageProviderId: blobTable.storageProviderId,
          })
          .from(documentTable)
          .leftJoin(
            fileTable,
            and(
              eq(fileTable.id, documentTable.fileId),
              eq(fileTable.isActive, true),
            ),
          )
          .leftJoin(blobTable, eq(blobTable.id, fileTable.blobId))
          .where(
            whereConditions.length === 1
              ? whereConditions[0]
              : and(...whereConditions),
          )
      )[0];

      if (!key || !storageProviderId) return null;

      const provider = await getServiceFromDBId<StorageProvider>(
        drizzle,
        pluginRegistry,
        storageProviderId,
      );

      return await provider.getPresignedGetUrl(key);
    }),
});
