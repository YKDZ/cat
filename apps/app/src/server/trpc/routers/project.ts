import { prisma } from "@cat/db";
import type { PrismaError} from "@cat/shared";
import { ProjectSchema } from "@cat/shared";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";
import { authedProcedure, publicProcedure, router } from "../server";

export const projectRouter = router({
  create: authedProcedure
    .input(
      z.object({
        name: z.string(),
        description: z.string().nullable(),
        sourceLanguageId: z.string(),
        targetLanguageIds: z.array(z.string()),
        memoryIds: z.array(z.cuid2()),
        glossaryIds: z.array(z.cuid2()),
        createMemory: z.boolean(),
        createGlossary: z.boolean(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const {
        name,
        description,
        sourceLanguageId,
        targetLanguageIds,
        memoryIds,
        glossaryIds,
        createMemory,
        createGlossary,
      } = input;
      const { user } = ctx;

      const project = await prisma.project
        .create({
          data: {
            name,
            description,
            Creator: {
              connect: {
                id: user.id,
              },
            },
            SourceLanguage: {
              connect: {
                id: sourceLanguageId,
              },
            },
            TargetLanguages: {
              connect: targetLanguageIds.map((id) => ({
                id,
              })),
            },
            Memories: {
              connect: memoryIds.map((id) => {
                return {
                  id,
                };
              }),
              create: createMemory ? [{ name, creatorId: user.id }] : undefined,
            },
            Glossaries: {
              connect: glossaryIds.map((id) => {
                return {
                  id,
                };
              }),
              create: createGlossary
                ? [{ name, creatorId: user.id }]
                : undefined,
            },
          },
        })
        .catch((e: PrismaError) => {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: e.message,
          });
        });

      return ProjectSchema.parse(project);
    }),
  linkGlossary: authedProcedure
    .input(
      z.object({
        id: z.cuid2(),
        glossaryIds: z.array(z.cuid2()),
      }),
    )
    .mutation(async ({ input }) => {
      const { id, glossaryIds } = input;

      await prisma.project.update({
        where: {
          id,
        },
        data: {
          Glossaries: {
            connect: glossaryIds.map((glossaryId) => ({
              id: glossaryId,
            })),
          },
        },
      });
    }),
  unlinkGlossary: authedProcedure
    .input(
      z.object({
        id: z.cuid2(),
        glossaryIds: z.array(z.cuid2()),
      }),
    )
    .mutation(async ({ input }) => {
      const { id, glossaryIds } = input;

      await prisma.project.update({
        where: {
          id,
        },
        data: {
          Glossaries: {
            disconnect: glossaryIds.map((glossaryId) => ({
              id: glossaryId,
            })),
          },
        },
      });
    }),
  delete: authedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { user } = ctx;
      const { id } = input;

      const project = await prisma.project.findUnique({
        where: {
          id,
        },
      });

      if (!project || project.creatorId != user.id)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Do not have permission to delete this project",
        });

      await prisma.project.delete({
        where: {
          id,
        },
      });
    }),
  listUserParticipated: publicProcedure
    .input(
      z.object({
        userId: z.cuid2(),
      }),
    )
    .query(async ({ input }) => {
      const { userId } = input;

      return await prisma.$transaction(async (tx) => {
        const projectIds = (
          await tx.permission.findMany({
            where: {
              userId: userId,
              permission: {
                startsWith: "project.translate.",
              },
            },
            select: {
              permission: true,
            },
          })
        ).map((result) => result.permission.split(".")[2]);

        const projects = await tx.project.findMany({
          where: {
            OR: [
              {
                creatorId: userId,
              },
              {
                id: {
                  in: projectIds,
                },
              },
            ],
          },
          include: {
            Creator: true,
            SourceLanguage: true,
            TargetLanguages: true,
            Documents: {
              include: {
                File: {
                  include: {
                    Type: true,
                  },
                },
              },
            },
          },
        });

        return z.array(ProjectSchema).parse(projects);
      });
    }),
  query: authedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .output(ProjectSchema.nullable())
    .query(async ({ input }) => {
      const { id } = input;

      return ProjectSchema.nullable().parse(
        await prisma.project.findUnique({
          where: {
            id,
          },
          include: {
            Creator: true,
            TargetLanguages: true,
            SourceLanguage: true,
            Documents: {
              include: {
                File: {
                  include: {
                    Type: true,
                  },
                },
              },
            },
          },
        }),
      );
    }),
  addNewLanguage: authedProcedure
    .input(
      z.object({
        projectId: z.string(),
        languageId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { projectId, languageId } = input;
      const { user } = ctx;

      return ProjectSchema.parse(
        await prisma.project
          .update({
            where: {
              id: projectId,
              creatorId: user.id,
            },
            data: {
              TargetLanguages: {
                connect: {
                  id: languageId,
                },
              },
            },
            include: {
              TargetLanguages: true,
            },
          })
          .catch((e: PrismaError) => {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: e.message,
            });
          }),
      );
    }),
  join: authedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { id } = input;
      const { user } = ctx;

      await prisma.permission.create({
        data: {
          userId: user.id,
          permission: `project.translate.${id}`,
        },
      });
    }),
  countTranslatableElement: authedProcedure
    .input(
      z.object({
        id: z.cuid2(),
      }),
    )
    .output(z.number().int().min(0))
    .query(async ({ input }) => {
      const { id } = input;

      return await prisma.translatableElement.count({
        where: {
          Document: {
            Project: {
              id,
            },
          },
        },
      });
    }),
  countTranslatedElement: authedProcedure
    .input(
      z.object({
        id: z.cuid2(),
        languageId: z.string(),
      }),
    )
    .output(z.number().int().min(0))
    .query(async ({ input }) => {
      const { id, languageId } = input;

      return await prisma.translatableElement.count({
        where: {
          Document: {
            Project: {
              id,
            },
          },
          Translations: {
            some: {
              languageId,
            },
          },
        },
      });
    }),
  countTranslatedElementWithApproved: authedProcedure
    .input(
      z.object({
        id: z.cuid2(),
        languageId: z.string(),
        isApproved: z.boolean(),
      }),
    )
    .output(z.number().int().min(0))
    .query(async ({ input }) => {
      const { id, languageId, isApproved } = input;

      return await prisma.translatableElement.count({
        where: {
          Document: {
            Project: {
              id,
            },
          },
          Translations: {
            some: {
              languageId,
              isApproved,
            },
          },
        },
      });
    }),
});
