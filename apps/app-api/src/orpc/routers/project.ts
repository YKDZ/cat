import type { VCSContext } from "@cat/vcs";

import {
  addProjectTargetLanguages,
  countProjectElements,
  createGlossary as createGlossaryCommand,
  createMemory as createMemoryCommand,
  createProject,
  createProjectTranslationSnapshot,
  createRootDocument,
  deleteProject,
  executeCommand,
  executeQuery,
  getProject,
  getProjectTargetLanguages,
  listProjectDocuments,
  listOwnedProjects,
  linkProjectGlossaries,
  linkProjectMemories,
  unlinkProjectGlossaries,
  unlinkProjectMemories,
  updateProject,
} from "@cat/domain";
import { DocumentSchema } from "@cat/shared";
import { LanguageSchema } from "@cat/shared";
import { ProjectSchema } from "@cat/shared";
import * as z from "zod";

import { authed, checkPermission } from "@/orpc/server";
import { createVCSRouteHelper } from "@/utils/vcs-route-helper";

// 使用新的类型安全权限中间件
// mapInput 函数 (i) => i.projectId 的参数类型从 .input() schema 自动推断
export const del = authed
  .input(
    z.object({
      projectId: z.uuidv4(),
    }),
  )
  .use(checkPermission("project", "owner"), (i) => i.projectId)
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;

    const { middleware } = createVCSRouteHelper(drizzle);
    const vcsCtx: VCSContext = {
      mode: "direct",
      projectId: input.projectId,
      createdBy: user.id,
    };
    await middleware.interceptWrite(
      vcsCtx,
      "project",
      input.projectId,
      "DELETE",
      { projectId: input.projectId },
      null,
      async () => executeCommand({ db: drizzle }, deleteProject, input),
    );
  });

export const update = authed
  .input(
    z.object({
      projectId: z.uuidv4(),
      name: z.string().min(1).optional(),
      description: z.string().min(0).optional(),
    }),
  )
  .use(checkPermission("project", "editor"), (i) => i.projectId)
  .output(ProjectSchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;

    const { middleware } = createVCSRouteHelper(drizzle);
    const vcsCtx: VCSContext = {
      mode: "direct",
      projectId: input.projectId,
      createdBy: user.id,
    };
    return await middleware.interceptWrite(
      vcsCtx,
      "project",
      input.projectId,
      "UPDATE",
      { projectId: input.projectId },
      { ...input },
      async () => executeCommand({ db: drizzle }, updateProject, input),
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

    const project = await drizzle.transaction(async (tx) => {
      const project = await executeCommand({ db: tx }, createProject, {
        name,
        description,
        creatorId: user.id,
      });

      await executeCommand({ db: tx }, createRootDocument, {
        projectId: project.id,
        creatorId: user.id,
        name: "<root>",
      });

      if (targetLanguageIds.length > 0) {
        await executeCommand({ db: tx }, addProjectTargetLanguages, {
          projectId: project.id,
          languageIds: targetLanguageIds,
        });
      }

      const linkedMemoryIds = [...memoryIds];
      const linkedGlossaryIds = [...glossaryIds];

      if (createMemory) {
        await executeCommand({ db: tx }, createMemoryCommand, {
          name,
          creatorId: user.id,
          projectIds: [project.id],
        });
      }

      if (createGlossary) {
        await executeCommand({ db: tx }, createGlossaryCommand, {
          name,
          creatorId: user.id,
          projectIds: [project.id],
        });
      }

      if (linkedGlossaryIds.length > 0) {
        await executeCommand({ db: tx }, linkProjectGlossaries, {
          projectId: project.id,
          glossaryIds: linkedGlossaryIds,
        });
      }

      if (linkedMemoryIds.length > 0) {
        await executeCommand({ db: tx }, linkProjectMemories, {
          projectId: project.id,
          memoryIds: linkedMemoryIds,
        });
      }

      return project;
    });

    // Post-write audit: project ID not available before creation
    const { middleware } = createVCSRouteHelper(drizzle);
    const vcsCtx: VCSContext = {
      mode: "direct",
      projectId: project.id,
      createdBy: user.id,
    };
    await middleware.interceptWrite(
      vcsCtx,
      "project",
      project.id,
      "CREATE",
      null,
      { name: project.name, description: project.description },
      async () => project,
    );

    return project;
  });

export const linkGlossary = authed
  .input(
    z.object({
      projectId: z.uuidv4(),
      glossaryIds: z.array(z.uuidv4()),
    }),
  )
  .use(checkPermission("project", "editor"), (i) => i.projectId)
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    await executeCommand({ db: drizzle }, linkProjectGlossaries, input);
  });

export const linkMemory = authed
  .input(
    z.object({
      projectId: z.uuidv4(),
      memoryIds: z.array(z.uuidv4()),
    }),
  )
  .use(checkPermission("project", "editor"), (i) => i.projectId)
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    await executeCommand({ db: drizzle }, linkProjectMemories, input);
  });

export const unlinkGlossary = authed
  .input(
    z.object({
      projectId: z.uuidv4(),
      glossaryIds: z.array(z.uuidv4()),
    }),
  )
  .use(checkPermission("project", "editor"), (i) => i.projectId)
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    await executeCommand({ db: drizzle }, unlinkProjectGlossaries, input);
  });

export const unlinkMemory = authed
  .input(
    z.object({
      projectId: z.uuidv4(),
      memoryIds: z.array(z.uuidv4()),
    }),
  )
  .use(checkPermission("project", "editor"), (i) => i.projectId)
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    await executeCommand({ db: drizzle }, unlinkProjectMemories, input);
  });

export const getUserOwned = authed
  .output(z.array(ProjectSchema))
  .handler(async ({ context }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;

    return await executeQuery({ db: drizzle }, listOwnedProjects, {
      creatorId: user.id,
    });
  });

export const get = authed
  .input(
    z.object({
      projectId: z.uuidv4(),
    }),
  )
  .use(checkPermission("project", "viewer"), (i) => i.projectId)
  .output(ProjectSchema.nullable())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    return await executeQuery({ db: drizzle }, getProject, input);
  });

export const addTargetLanguages = authed
  .input(
    z.object({
      projectId: z.uuidv4(),
      languageId: z.string(),
    }),
  )
  .use(checkPermission("project", "editor"), (i) => i.projectId)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    await executeCommand({ db: drizzle }, addProjectTargetLanguages, {
      projectId: input.projectId,
      languageIds: [input.languageId],
    });
  });

export const countElement = authed
  .input(
    z.object({
      projectId: z.uuidv4(),
      isTranslated: z.boolean().optional(),
      isApproved: z.boolean().optional(),
      languageId: z.string().optional(),
    }),
  )
  .use(checkPermission("project", "viewer"), (i) => i.projectId)
  .output(z.int().min(0))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    return await executeQuery({ db: drizzle }, countProjectElements, input);
  });

export const getDocuments = authed
  .input(z.object({ projectId: z.string() }))
  .use(checkPermission("project", "viewer"), (i) => i.projectId)
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

    return await executeQuery({ db: drizzle }, listProjectDocuments, input);
  });

export const getTargetLanguages = authed
  .input(
    z.object({
      projectId: z.string(),
    }),
  )
  .use(checkPermission("project", "viewer"), (i) => i.projectId)
  .output(z.array(LanguageSchema))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    return await executeQuery(
      { db: drizzle },
      getProjectTargetLanguages,
      input,
    );
  });

export const snapshot = authed
  .input(
    z.object({
      projectId: z.uuidv4(),
    }),
  )
  .use(checkPermission("project", "editor"), (i) => i.projectId)
  .output(z.int().min(0))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;
    const { projectId } = input;

    return await drizzle.transaction(async (tx) => {
      return await executeCommand(
        { db: tx },
        createProjectTranslationSnapshot,
        {
          projectId,
          creatorId: user.id,
        },
      );
    });
  });
