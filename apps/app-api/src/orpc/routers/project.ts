import { ProjectSchema } from "@cat/shared/schema/drizzle/project";
import * as z from "zod/v4";
import { DocumentSchema } from "@cat/shared/schema/drizzle/document";
import {
  eq,
  glossaryToProject,
  memoryToProject,
  project as projectTable,
  projectTargetLanguage,
  memory as memoryTable,
  glossary as glossaryTable,
  and,
  inArray,
  document as documentTable,
  translatableElement as translatableElementTable,
  translation as translationTable,
  count,
  translatableString,
  documentClosure,
  getColumns,
  not,
  exists,
  type DrizzleClient,
  role as roleTable,
  permissionTemplate as permissionTemplateTable,
  permission as permissionTable,
  rolePermission as rolePermissionTable,
  userRole as userRoleTable,
  language,
  isNull,
  isNotNull,
} from "@cat/db";
import { assertFirstOrNull, assertSingleNonNullish } from "@cat/shared/utils";
import { LanguageSchema } from "@cat/shared/schema/drizzle/misc";
import { authed } from "@/orpc/server";
import { takeSnapshot } from "@cat/app-server-shared/utils";

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
              eq(translatableString.languageId, languageId),
              isNotNull(translatableElementTable.approvedTranslationId),
            ),
          ),
      ),
    );
  }

  return conditions;
};

export const del = authed
  .input(
    z.object({
      projectId: z.uuidv4(),
    }),
  )
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { projectId } = input;

    await drizzle.delete(projectTable).where(eq(projectTable.id, projectId));
  });

export const update = authed
  .input(
    z.object({
      projectId: z.uuidv4(),
      name: z.string().min(1).optional(),
      description: z.string().min(0).optional(),
    }),
  )
  .output(ProjectSchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { projectId, name, description } = input;

    return assertSingleNonNullish(
      await drizzle
        .update(projectTable)
        .set({
          name,
          description,
        })
        .where(eq(projectTable.id, projectId))
        .returning(),
    );
  });

export const create = authed
  .input(
    z.object({
      name: z.string(),
      description: z.string().nullable(),
      targetLanguageIds: z.array(z.string()),
      memoryIds: z.array(z.uuidv4()),
      glossaryIds: z.array(z.uuidv4()),
      createMemory: z.boolean(),
      createGlossary: z.boolean(),
    }),
  )
  .output(ProjectSchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;
    const {
      name,
      description,
      targetLanguageIds,
      memoryIds,
      glossaryIds,
      createMemory,
      createGlossary,
    } = input;

    return await drizzle.transaction(async (tx) => {
      const project = assertSingleNonNullish(
        await tx
          .insert(projectTable)
          .values({
            name,
            description,
            creatorId: user.id,
          })
          .returning(),
      );

      // 为用户分配一个新角色
      // 其中有一个作用于当前 project 的根权限
      const role = assertSingleNonNullish(
        await tx
          .insert(roleTable)
          .values({
            name: "Project Owner",
            scopeType: "PROJECT",
            scopeId: project.id,
          })
          .returning({
            id: roleTable.id,
          }),
      );

      const permissionTemplate = assertSingleNonNullish(
        await tx
          .select({
            id: permissionTemplateTable.id,
          })
          .from(permissionTemplateTable)
          .where(
            and(
              eq(permissionTemplateTable.content, "*"),
              eq(permissionTemplateTable.resourceType, "PROJECT"),
            ),
          ),
      );

      const permission = assertSingleNonNullish(
        await tx
          .insert(permissionTable)
          .values({
            templateId: permissionTemplate.id,
            resourceId: project.id,
          })
          .returning({
            id: permissionTable.id,
          }),
      );

      await tx.insert(userRoleTable).values({
        userId: user.id,
        roleId: role.id,
      });

      await tx.insert(rolePermissionTable).values({
        roleId: role.id,
        permissionId: permission.id,
      });
      // 完成角色分配

      // 创建一颗根树用于存放文档
      const root = assertSingleNonNullish(
        await tx
          .insert(documentTable)
          .values({
            name: "<root>",
            projectId: project.id,
            creatorId: user.id,
            isDirectory: true,
          })
          .returning({ id: documentTable.id }),
      );

      await tx.insert(documentClosure).values({
        ancestor: root.id,
        descendant: root.id,
        depth: 0,
        projectId: project.id,
      });
      // 完成创建根树

      if (targetLanguageIds.length > 0)
        await tx.insert(projectTargetLanguage).values(
          targetLanguageIds.map((languageId) => ({
            projectId: project.id,
            languageId,
          })),
        );

      if (createMemory) {
        const memory = assertSingleNonNullish(
          await tx
            .insert(memoryTable)
            .values({
              name,
              creatorId: user.id,
            })
            .returning({ id: memoryTable.id }),
        );
        memoryIds.push(memory.id);
      }

      if (createGlossary) {
        const glossary = assertSingleNonNullish(
          await tx
            .insert(glossaryTable)
            .values({
              name,
              creatorId: user.id,
            })
            .returning({ id: glossaryTable.id }),
        );
        glossaryIds.push(glossary.id);
      }

      if (glossaryIds.length > 0)
        await tx.insert(glossaryToProject).values(
          glossaryIds.map((glossaryId) => ({
            projectId: project.id,
            glossaryId,
          })),
        );

      if (memoryIds.length > 0)
        await tx.insert(memoryToProject).values(
          memoryIds.map((memoryId) => ({
            projectId: project.id,
            memoryId,
          })),
        );

      return project;
    });
  });

export const linkGlossary = authed
  .input(
    z.object({
      projectId: z.uuidv4(),
      glossaryIds: z.array(z.uuidv4()),
    }),
  )
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { projectId, glossaryIds } = input;

    if (glossaryIds.length === 0) return;

    await drizzle.insert(glossaryToProject).values(
      glossaryIds.map((glossaryId) => ({
        projectId,
        glossaryId,
      })),
    );
  });

export const linkMemory = authed
  .input(
    z.object({
      projectId: z.uuidv4(),
      memoryIds: z.array(z.uuidv4()),
    }),
  )
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { projectId, memoryIds } = input;

    if (memoryIds.length === 0) return;

    await drizzle.insert(memoryToProject).values(
      memoryIds.map((memoryId) => ({
        projectId,
        memoryId,
      })),
    );
  });

export const unlinkGlossary = authed
  .input(
    z.object({
      projectId: z.uuidv4(),
      glossaryIds: z.array(z.uuidv4()),
    }),
  )
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { projectId, glossaryIds } = input;

    await drizzle
      .delete(glossaryToProject)
      .where(
        and(
          eq(glossaryToProject.projectId, projectId),
          inArray(glossaryToProject.glossaryId, glossaryIds),
        ),
      );
  });

export const unlinkMemory = authed
  .input(
    z.object({
      projectId: z.uuidv4(),
      memoryIds: z.array(z.uuidv4()),
    }),
  )
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { projectId, memoryIds } = input;

    await drizzle
      .delete(memoryToProject)
      .where(
        and(
          eq(memoryToProject.projectId, projectId),
          inArray(memoryToProject.memoryId, memoryIds),
        ),
      );
  });

export const getUserOwned = authed
  .output(z.array(ProjectSchema))
  .handler(async ({ context }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;

    return await drizzle
      .select()
      .from(projectTable)
      .where(eq(projectTable.creatorId, user.id));
  });

export const get = authed
  .input(
    z.object({
      projectId: z.uuidv4(),
    }),
  )
  .output(ProjectSchema.nullable())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { projectId } = input;

    return assertFirstOrNull(
      await drizzle
        .select()
        .from(projectTable)
        .where(eq(projectTable.id, projectId)),
    );
  });

export const addTargetLanguages = authed
  .input(
    z.object({
      projectId: z.uuidv4(),
      languageId: z.string(),
    }),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { projectId, languageId } = input;

    await drizzle.insert(projectTargetLanguage).values({
      projectId,
      languageId,
    });
  });

export const countElement = authed
  .input(
    z.object({
      projcetId: z.uuidv4(),
      isTranslated: z.boolean().optional(),
      isApproved: z.boolean().optional(),
      languageId: z.string().optional(),
    }),
  )
  .output(z.int().min(0))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { projcetId, isApproved, isTranslated, languageId } = input;

    const whereConditions = [eq(documentTable.projectId, projcetId)];

    // 添加翻译状态条件
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
          documentTable,
          eq(translatableElementTable.documentId, documentTable.id),
        )
        .where(
          whereConditions.length === 1
            ? whereConditions[0]
            : and(...whereConditions),
        ),
    ).count;
  });

export const getDocuments = authed
  .input(z.object({ projectId: z.string() }))
  .output(
    z.array(
      DocumentSchema.extend({
        parentId: z.string().nullable(),
      }),
    ),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { projectId } = input;

    // 查询所有文档及其父文档关系
    const documents = await drizzle
      .select({
        ...getColumns(documentTable),
        parentId: documentClosure.ancestor,
      })
      .from(documentTable)
      .leftJoin(
        documentClosure,
        and(
          eq(documentClosure.descendant, documentTable.id),
          eq(documentClosure.depth, 1),
          eq(documentClosure.projectId, projectId),
        ),
      )
      .where(and(eq(documentTable.projectId, projectId)));

    return documents;
  });

export const getTargetLanguages = authed
  .input(
    z.object({
      projectId: z.string(),
    }),
  )
  .output(z.array(LanguageSchema))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { projectId } = input;

    return await drizzle.transaction(async (tx) => {
      const ids = (
        await tx
          .select({
            languageId: projectTargetLanguage.languageId,
          })
          .from(projectTargetLanguage)
          .where(eq(projectTargetLanguage.projectId, projectId))
      ).map((i) => i.languageId);

      return await tx
        .select(getColumns(language))
        .from(language)
        .where(inArray(language.id, ids));
    });
  });

export const snapshot = authed
  .input(
    z.object({
      projectId: z.uuidv4(),
    }),
  )
  .output(z.int().min(0))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;
    const { projectId } = input;

    return await drizzle.transaction(async (tx) => {
      return await takeSnapshot(tx, projectId, user.id);
    });
  });
