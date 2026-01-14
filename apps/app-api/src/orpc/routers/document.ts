import { join } from "node:path";
import * as z from "zod/v4";
import {
  sanitizeFileName,
  translatableElement as translatableElementTable,
  document as documentTable,
  file as fileTable,
  translation as translationTable,
  project as projectTable,
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
  getColumns,
  blob as blobTable,
  isNotNull,
  isNull,
} from "@cat/db";
import {
  ElementTranslationStatusSchema,
  FileMetaSchema,
} from "@cat/shared/schema/misc";
import {
  DocumentSchema,
  TranslatableElementSchema,
} from "@cat/shared/schema/drizzle/document";
import {
  createDocumentUnderParent,
  finishPresignedPutFile,
  getServiceFromDBId,
  preparePresignedPutFile,
  getDownloadUrl,
  firstOrGivenService,
} from "@cat/app-server-shared/utils";
import {
  assertFirstNonNullish,
  assertSingleNonNullish,
  assertSingleOrNull,
} from "@cat/shared/utils";
import { StorageProvider } from "@cat/plugin-core";
import { randomUUID } from "node:crypto";
import { upsertDocumentFromFileWorkflow } from "@cat/app-workers";
import { authed } from "@/orpc/server";
import { ORPCError } from "@orpc/client";

/**
 * 构建翻译状态查询条件
 * @param drizzle - Drizzle 数据库实例
 * @param isTranslated - 是否已翻译
 * @param isApproved - 是否已审批
 * @returns 翻译状态查询条件数组
 */
const buildTranslationStatusConditions = (
  drizzle: DrizzleClient,
  isTranslated?: boolean,
  isApproved?: boolean,
  languageId?: string,
) => {
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
              isNull(translatableElementTable.approvedTranslationId),
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
              isNotNull(translatableElementTable.approvedTranslationId),
            ),
          ),
      ),
    );
  }

  return conditions;
};

export const prepareCreateFromFile = authed
  .input(
    z.object({
      meta: FileMetaSchema,
    }),
  )
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
      redisDB: { redis },
      pluginManager,
    } = context;
    const { meta } = input;

    // TODO 配置 storage
    const storage = firstOrGivenService(pluginManager, "STORAGE_PROVIDER");

    if (!storage)
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: `No storage provider found`,
      });

    const name = sanitizeFileName(meta.name);
    const key = join("documents", randomUUID() + name);

    const { url, putSessionId, fileId } = await preparePresignedPutFile(
      drizzle,
      redis,
      storage.service,
      storage.id,
      key,
      name,
    );

    return {
      url,
      putSessionId,
      fileId,
    };
  });

export const finishCreateFromFile = authed
  .input(
    z.object({
      projectId: z.uuidv4(),
      languageId: z.string(),
      putSessionId: z.uuidv4(),
    }),
  )
  .handler(async ({ input, context }) => {
    const { projectId, putSessionId, languageId } = input;
    const {
      drizzleDB: { client: drizzle },
      redisDB: { redis },
      user,
      pluginManager,
    } = context;

    const storage = firstOrGivenService(pluginManager, "VECTOR_STORAGE");
    const vectorizer = firstOrGivenService(pluginManager, "TEXT_VECTORIZER");

    if (!storage || !vectorizer) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "No storage provider available",
      });
    }

    assertSingleNonNullish(
      await drizzle
        .select({
          id: projectTable.id,
        })
        .from(projectTable)
        .where(eq(projectTable.id, projectId)),
      `Project ${projectId} not found`,
    );

    const fileId = await finishPresignedPutFile(
      drizzle,
      redis,
      pluginManager,
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
      const service = pluginManager
        .getServices("FILE_IMPORTER")
        .find(({ service }) => service.canImport({ name: fileName }));

      if (!service)
        throw new ORPCError("NOT_FOUND", {
          message: "No suitable file handler found for this file",
        });

      const { document } = await drizzle.transaction(async (tx) => {
        // 创建文档
        const document = await createDocumentUnderParent(tx, {
          creatorId: user.id,
          projectId,
          fileHandlerId: service.dbId,
          name: fileName,
        });

        // 更新文档关联到文件
        await tx
          .update(documentTable)
          .set({ fileId: fileId })
          .where(eq(documentTable.id, document.id));

        return { document };
      });

      await upsertDocumentFromFileWorkflow.run({
        documentId: document.id,
        fileId,
        languageId,
        vectorizerId: vectorizer.id,
        vectorStorageId: storage.id,
      });
    } else {
      const existDocument = assertSingleNonNullish(existDocumentRows);

      await upsertDocumentFromFileWorkflow.run({
        fileId,
        languageId,
        documentId: existDocument.id,
        vectorizerId: vectorizer.id,
        vectorStorageId: storage.id,
      });
    }
  });

export const get = authed
  .input(z.object({ documentId: z.uuidv4() }))
  .output(DocumentSchema.nullable())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { documentId } = input;

    return assertSingleOrNull(
      await drizzle
        .select()
        .from(documentTable)
        .where(eq(documentTable.id, documentId)),
    );
  });

export const countElement = authed
  .input(
    z.object({
      documentId: z.uuidv4(),
      searchQuery: z.string().default(""),
      isApproved: z.boolean().optional(),
      isTranslated: z.boolean().optional(),
      languageId: z.string().optional(),
    }),
  )
  .output(z.int().min(0))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { documentId, searchQuery, isApproved, isTranslated, languageId } =
      input;

    const whereConditions = [
      eq(translatableElementTable.documentId, documentId),
    ];

    if (searchQuery.trim().length !== 0) {
      whereConditions.push(ilike(translatableString.value, `%${searchQuery}%`));
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
  });

export const getFirstElement = authed
  .input(
    z.object({
      documentId: z.uuidv4(),
      searchQuery: z.string().default(""),
      greaterThan: z.int().optional(),
      isApproved: z.boolean().optional(),
      isTranslated: z.boolean().optional(),
      languageId: z.string().optional(),
    }),
  )
  .output(TranslatableElementSchema.nullable())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
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
      whereConditions.push(ilike(translatableString.value, `%${searchQuery}%`));
    }

    if (greaterThan !== undefined) {
      whereConditions.push(gt(translatableElementTable.sortIndex, greaterThan));
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
      .select(getColumns(translatableElementTable))
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
  });

export const exportTranslatedFile = authed
  .input(
    z.object({
      documentId: z.uuidv4(),
      languageId: z.string(),
    }),
  )
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { documentId } = input;

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
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "指定文档不是基于文件的",
      });

    // TODO 导出文件
  });

export const getElementTranslationStatus = authed
  .input(
    z.object({
      elementId: z.int(),
      languageId: z.string(),
    }),
  )
  .output(ElementTranslationStatusSchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { elementId, languageId } = input;

    const { approvedTranslationId } = assertSingleNonNullish(
      await drizzle
        .select({
          approvedTranslationId: translatableElementTable.approvedTranslationId,
        })
        .from(translatableElementTable)
        .where(eq(translatableElementTable.id, elementId)),
      `Element ${elementId} not found`,
    );

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

    if (approvedTranslationId) {
      return "APPROVED";
    }

    return "TRANSLATED";
  });

export const getElements = authed
  .input(
    z.object({
      documentId: z.string(),
      page: z.int().int().default(0),
      pageSize: z.int().int().default(16),
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
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
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
      throw new ORPCError("BAD_REQUEST", {
        message: "isTranslated must be true when isApproved is set",
      });
    }

    const whereConditions = [
      eq(translatableElementTable.documentId, documentId),
    ];

    if (searchQuery?.trim().length !== 0) {
      whereConditions.push(ilike(translatableString.value, `%${searchQuery}%`));
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
        ...getColumns(translatableElementTable),
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
  });

export const getPageIndexOfElement = authed
  .input(
    z.object({
      elementId: z.int(),
      pageSize: z.int().default(16),
      searchQuery: z.string().default(""),
      isApproved: z.boolean().optional(),
      isTranslated: z.boolean().optional(),
      languageId: z.string().optional(),
    }),
  )
  .output(z.int())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    const {
      elementId,
      pageSize,
      searchQuery,
      isApproved,
      isTranslated,
      languageId,
    } = input;

    if (isApproved !== undefined && isTranslated !== true) {
      throw new ORPCError("BAD_REQUEST", {
        message: "isTranslated must be true when isApproved is set",
      });
    }

    const target = assertSingleNonNullish(
      await drizzle
        .select(getColumns(translatableElementTable))
        .from(translatableElementTable)
        .where(eq(translatableElementTable.id, elementId)),
      `Element ${elementId} with given id does not exists`,
    );

    const whereConditions = [
      lt(translatableElementTable.sortIndex, target.sortIndex ?? 0),
    ];

    if (searchQuery.trim().length !== 0) {
      whereConditions.push(ilike(translatableString.value, `%${searchQuery}%`));
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
  });

export const del = authed
  .input(
    z.object({
      id: z.uuidv4(),
    }),
  )
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { id } = input;

    await drizzle.delete(documentTable).where(eq(documentTable.id, id));
  });

export const getDocumentFileUrl = authed
  .input(
    z.object({
      documentId: z.uuidv4(),
    }),
  )
  .output(z.string().nullable())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      redisDB: { redis },
      pluginManager,
    } = context;
    const { documentId } = input;

    const whereConditions = [eq(documentTable.id, documentId)];

    const { key, storageProviderId } = assertFirstNonNullish(
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
        ),
    );

    if (!key || !storageProviderId) return null;

    const provider = getServiceFromDBId<StorageProvider>(
      pluginManager,
      storageProviderId,
    );

    return await getDownloadUrl(redis, provider, storageProviderId, key, 120);
  });

export const countTranslation = authed
  .input(
    z.object({
      documentId: z.uuidv4(),
      languageId: z.string(),
      isApproved: z.boolean().optional(),
    }),
  )
  .output(z.int().min(0))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { documentId, languageId, isApproved } = input;

    const baseQuery = drizzle
      .select({ count: count() })
      .from(translationTable)
      .innerJoin(
        translatableElementTable,
        eq(translationTable.translatableElementId, translatableElementTable.id),
      )
      .innerJoin(
        translatableString,
        eq(translatableString.id, translationTable.stringId),
      )
      .where(
        and(
          eq(translatableElementTable.documentId, documentId),
          eq(translatableString.languageId, languageId),
          isApproved
            ? isNotNull(translatableElementTable.approvedTranslationId)
            : undefined,
        ),
      );

    return assertSingleNonNullish(await baseQuery).count;
  });
