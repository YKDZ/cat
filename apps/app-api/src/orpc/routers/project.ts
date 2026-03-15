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
import { DocumentSchema } from "@cat/shared/schema/drizzle/document";
import { LanguageSchema } from "@cat/shared/schema/drizzle/misc";
import { ProjectSchema } from "@cat/shared/schema/drizzle/project";
import * as z from "zod/v4";

import { authed } from "@/orpc/server";

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

    await executeCommand({ db: drizzle }, deleteProject, input);
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

    return await executeCommand({ db: drizzle }, updateProject, input);
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
    await executeCommand({ db: drizzle }, linkProjectGlossaries, input);
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
    await executeCommand({ db: drizzle }, linkProjectMemories, input);
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
    await executeCommand({ db: drizzle }, unlinkProjectGlossaries, input);
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
  .output(z.int().min(0))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    return await executeQuery({ db: drizzle }, countProjectElements, input);
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

    return await executeQuery({ db: drizzle }, listProjectDocuments, input);
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
