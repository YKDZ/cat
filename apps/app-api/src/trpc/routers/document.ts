import { join } from "node:path";
import { TRPCError } from "@trpc/server";
import * as z from "zod/v4";
import {
  sanitizeFileName,
  translatableElement as translatableElementTable,
  document as documentTable,
  documentVersion as documentVersionTable,
  file as fileTable,
  pluginService as pluginServiceTable,
  pluginInstallation as pluginInstallationTable,
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
} from "@cat/db";

import {
  ElementTranslationStatusSchema,
  FileMetaSchema,
} from "@cat/shared/schema/misc";
import { FileSchema } from "@cat/shared/schema/drizzle/file";
import {
  DocumentSchema,
  DocumentVersionSchema,
  TranslatableElementSchema,
} from "@cat/shared/schema/drizzle/document";
import { useStorage } from "@cat/app-server-shared/utils";
import { exportTranslatedFileQueue } from "@cat/app-workers/workers";
import { upsertDocumentElementsFromFileQueue } from "@cat/app-workers/workers";
import { assertSingleNonNullish } from "@cat/shared/utils";
import { authedProcedure, router } from "@/trpc/server.ts";

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
) {
  const conditions = [];

  if (isTranslated === false && isApproved === undefined) {
    // 没有翻译
    conditions.push(
      not(
        exists(
          drizzle
            .select()
            .from(translationTable)
            .where(
              eq(
                translationTable.translatableElementId,
                translatableElementTable.id,
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
          .where(
            eq(
              translationTable.translatableElementId,
              translatableElementTable.id,
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
          .where(
            and(
              eq(
                translationTable.translatableElementId,
                translatableElementTable.id,
              ),
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
          .where(
            and(
              eq(
                translationTable.translatableElementId,
                translatableElementTable.id,
              ),
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
  fileUploadURL: authedProcedure
    .input(
      z.object({
        meta: FileMetaSchema,
      }),
    )
    .output(
      z.object({
        url: z.url(),
        file: FileSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { meta } = input;
      const storageResult = await useStorage(
        drizzle,
        "s3-storage-provider",
        "S3",
        "GLOBAL",
        "",
      );
      const { id: providerId, provider } = storageResult;

      const name = sanitizeFileName(meta.name);

      const path = join(provider.getBasicPath(), "documents", name);

      // TODO 校验文件类型
      const file = assertSingleNonNullish(
        await drizzle
          .insert(fileTable)
          .values({
            originName: meta.name,
            storedPath: path,
            storageProviderId: providerId,
          })
          .returning(),
      );

      const url = await provider.generateUploadURL(path, 120);

      return {
        url,
        file: FileSchema.parse(file),
      };
    }),
  createFromFile: authedProcedure
    .input(
      z.object({
        languageId: z.string(),
        projectId: z.string(),
        fileId: z.number().int(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { projectId, fileId, languageId } = input;
      const {
        drizzleDB: { client: drizzle },
        user,
        pluginRegistry,
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

      const dbFile = await drizzle.query.file.findFirst({
        where: (file, { eq }) => eq(file.id, fileId),
      });

      if (!dbFile)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `File ${fileId} not found`,
        });

      const existDocumentRows = await drizzle
        .select({
          id: documentTable.id,
        })
        .from(documentTable)
        .innerJoin(fileTable, eq(fileTable.documentId, documentTable.id))
        .where(
          and(
            eq(documentTable.projectId, projectId),
            eq(documentTable.name, dbFile.originName),
          ),
        )
        .limit(1);

      if (existDocumentRows.length === 0) {
        const service = (
          await pluginRegistry.getPluginServices(
            drizzle,
            "TRANSLATABLE_FILE_HANDLER",
          )
        ).find(({ service }) => service.canExtractElement(dbFile));

        if (!service)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "No suitable file handler found for this file",
          });

        const result = await drizzle.transaction(async (tx) => {
          // 创建文档
          const document = assertSingleNonNullish(
            await tx
              .insert(documentTable)
              .values({
                creatorId: user.id,
                projectId,
                fileHandlerId: service.id,
                name: dbFile.originName,
              })
              .returning(),
          );

          // 更新文件关联到文档
          await tx
            .update(fileTable)
            .set({ documentId: document.id })
            .where(eq(fileTable.id, fileId));

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

        await upsertDocumentElementsFromFileQueue.add(result.task.id, {
          documentId: result.document.id,
          fileId,
          languageId,
        });
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

        await upsertDocumentElementsFromFileQueue.add(task.id, {
          documentId: existDocument.id,
          fileId,
          languageId,
        });
      }
    }),
  get: authedProcedure
    .input(z.object({ id: z.string() }))
    .output(
      DocumentSchema.extend({
        File: FileSchema.nullable(),
      }).nullable(),
    )
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { id } = input;

      const document = await drizzle.query.document.findFirst({
        where: (document, { eq }) => eq(document.id, id),
      });

      if (!document) return null;

      const file = await drizzle.query.file.findFirst({
        where: (file, { eq }) => eq(file.documentId, id),
      });

      return {
        ...document,
        File: file ?? null,
      };
    }),
  countElement: authedProcedure
    .input(
      z.object({
        documentId: z.string(),
        searchQuery: z.string().default(""),
        isApproved: z.boolean().optional(),
        isTranslated: z.boolean().optional(),
      }),
    )
    .output(z.int().min(0))
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { documentId, searchQuery, isApproved, isTranslated } = input;

      if (isApproved !== undefined && isTranslated !== true) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "isTranslated must be true when isApproved is set",
        });
      }

      const whereConditions = [
        eq(translatableElementTable.documentId, documentId),
      ];

      if (searchQuery.trim().length !== 0) {
        whereConditions.push(
          ilike(translatableElementTable.value, `%${searchQuery}%`),
        );
      }

      // 添加翻译状态条件
      whereConditions.push(
        ...buildTranslationStatusConditions(drizzle, isTranslated, isApproved),
      );

      const result = await drizzle
        .select({ count: count() })
        .from(translatableElementTable)
        .where(
          whereConditions.length === 1
            ? whereConditions[0]
            : and(...whereConditions),
        );

      return result[0].count;
    }),
  queryFirstElement: authedProcedure
    .input(
      z.object({
        documentId: z.string(),
        searchQuery: z.string().default(""),
        greaterThan: z.int().optional(),
        isApproved: z.boolean().optional(),
        isTranslated: z.boolean().optional(),
      }),
    )
    .output(TranslatableElementSchema.nullable())
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { documentId, searchQuery, greaterThan, isApproved, isTranslated } =
        input;

      if (isApproved !== undefined && isTranslated !== true) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "isTranslated must be true when isApproved is set",
        });
      }

      const whereConditions = [
        eq(translatableElementTable.documentId, documentId),
      ];

      if (searchQuery.trim().length !== 0) {
        whereConditions.push(
          ilike(translatableElementTable.value, `%${searchQuery}%`),
        );
      }

      if (greaterThan !== undefined) {
        whereConditions.push(
          gt(translatableElementTable.sortIndex, greaterThan),
        );
      }

      // 添加翻译状态条件
      whereConditions.push(
        ...buildTranslationStatusConditions(drizzle, isTranslated, isApproved),
      );

      const elements = await drizzle
        .select()
        .from(translatableElementTable)
        .where(
          whereConditions.length === 1
            ? whereConditions[0]
            : and(...whereConditions),
        )
        .orderBy(asc(translatableElementTable.sortIndex))
        .limit(1);

      return elements[0] || null;
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
      } = ctx;
      const { documentId, languageId } = input;

      const document = await drizzle.query.document.findFirst({
        where: (doc, { eq }) => eq(doc.id, documentId),
        columns: {
          projectId: true,
          fileHandlerId: true,
        },
      });

      const file = await drizzle.query.file.findFirst({
        where: (f, { eq }) => eq(f.documentId, documentId),
        columns: {
          id: true,
        },
      });

      if (!document)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "指定文档不存在",
        });

      if (!file || !document.fileHandlerId)
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

      await exportTranslatedFileQueue.add(
        task.id,
        {
          projectId: document.projectId,
          documentId,
          languageId,
        },
        {
          jobId: task.id,
        },
      );
    }),
  downloadTranslatedFile: authedProcedure
    .input(
      z.object({
        taskId: z.uuidv7(),
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
      if (task.status !== "completed")
        throw new TRPCError({
          message:
            task.status === "failed"
              ? "Task failed. Please retry or check console log"
              : "Do not find export task for this document and language",
          code: "BAD_REQUEST",
        });

      const storageResult = await useStorage(
        drizzle,
        "s3-storage-provider",
        "S3",
        "GLOBAL",
        "",
      );
      const { provider } = storageResult;
      const { fileId } = task.meta as {
        fileId: number;
      };

      const file = await drizzle.query.file.findFirst({
        where: (file, { eq }) => eq(file.id, fileId),
        columns: {
          storedPath: true,
          originName: true,
        },
      });

      if (!file)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "File does not exists",
        });

      const url = await provider.generateDownloadURL(
        file.storedPath,
        file.originName,
        60,
      );

      return {
        url,
        fileName: file.originName,
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
        .where(
          and(
            eq(translationTable.translatableElementId, elementId),
            eq(translationTable.languageId, languageId),
          ),
        );

      if (translations.length === 0) {
        return "NO";
      }

      // 检查是否有活跃的审批
      for (const translation of translations) {
        const activeApprovements = await drizzle
          .select()
          .from(translationApprovementTable)
          .where(
            and(
              eq(translationApprovementTable.translationId, translation.id),
              eq(translationApprovementTable.isActive, true),
            ),
          )
          .limit(1);

        if (activeApprovements.length > 0) {
          return "APPROVED";
        }
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
      }),
    )
    .output(z.array(TranslatableElementSchema))
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
          ilike(translatableElementTable.value, `%${searchQuery}%`),
        );
      }

      // 添加翻译状态条件
      whereConditions.push(
        ...buildTranslationStatusConditions(drizzle, isTranslated, isApproved),
      );

      const result = await drizzle
        .select()
        .from(translatableElementTable)
        .where(
          whereConditions.length === 1
            ? whereConditions[0]
            : and(...whereConditions),
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
          ilike(translatableElementTable.value, `%${searchQuery}%`),
        );
      }

      // 添加翻译状态条件
      whereConditions.push(
        ...buildTranslationStatusConditions(drizzle, isTranslated, isApproved),
      );

      const result = await drizzle
        .select({ count: count() })
        .from(translatableElementTable)
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
  getDocumentContent: authedProcedure
    .input(
      z.object({
        documentId: z.uuidv7(),
        documentVersionId: z.number().int().optional(),
      }),
    )
    .output(z.string())
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

      const documentData = assertSingleNonNullish(
        await drizzle
          .select({
            file: {
              id: fileTable.id,
              originName: fileTable.originName,
              storedPath: fileTable.storedPath,
              documentId: fileTable.documentId,
              userId: fileTable.userId,
              storageProviderId: fileTable.storageProviderId,
              createdAt: fileTable.createdAt,
              updatedAt: fileTable.updatedAt,
            },
            fileHandler: {
              serviceId: pluginServiceTable.serviceId,
              pluginId: pluginInstallationTable.pluginId,
            },
          })
          .from(documentTable)
          .leftJoin(fileTable, eq(fileTable.documentId, documentTable.id))
          .leftJoin(
            pluginServiceTable,
            eq(pluginServiceTable.id, documentTable.fileHandlerId),
          )
          .leftJoin(
            pluginInstallationTable,
            eq(
              pluginInstallationTable.id,
              pluginServiceTable.pluginInstallationId,
            ),
          )
          .where(
            whereConditions.length === 1
              ? whereConditions[0]
              : and(...whereConditions),
          )
          .limit(1),
      );

      if (
        !documentData.file ||
        !documentData.fileHandler ||
        !documentData.fileHandler.pluginId ||
        !documentData.fileHandler.serviceId
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "文档不是基于文件的",
        });

      const { service: handler } = (await pluginRegistry.getPluginService(
        drizzle,
        documentData.fileHandler.pluginId,
        "TRANSLATABLE_FILE_HANDLER",
        documentData.fileHandler.serviceId,
      ))!;

      if (!handler) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "文件的文件解析器不存在",
        });
      }

      const { provider } = await useStorage(
        drizzle,
        "s3-storage-provider",
        "S3",
        "GLOBAL",
        "",
      );
      const content = await provider.getContent(documentData.file.storedPath);

      const elements = await drizzle.query.translatableElement.findMany({
        where: (translatableElement, { eq, and }) =>
          and(
            eq(translatableElement.documentId, documentId),
            documentVersionId
              ? eq(translatableElement.documentVersionId, documentVersionId)
              : undefined,
          ),
        columns: {
          value: true,
          meta: true,
        },
      });

      return (
        await handler.getReplacedFileContent(
          content,
          elements.map(({ value, meta }) => ({
            value,
            meta: meta,
          })),
        )
      ).toString();
    }),
});
