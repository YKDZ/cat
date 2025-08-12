import type { PrismaError } from "@cat/shared";
import { ProjectSchema } from "@cat/shared";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { authedProcedure, publicProcedure, router } from "../server";

export const projectRouter = router({
  delete: authedProcedure
    .input(
      z.object({
        id: z.ulid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const { id } = input;

      await prisma.project.delete({
        where: {
          id,
        },
      });
    }),
  update: authedProcedure
    .input(
      z.object({
        id: z.ulid(),
        name: z.string().min(1).optional(),
        sourceLanguageId: z.string().optional(),
        targetLanguageIds: z.array(z.string()).optional(),
        description: z.string().min(0).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const { id, name, sourceLanguageId, targetLanguageIds, description } =
        input;

      return ProjectSchema.parse(
        await prisma.project.update({
          where: {
            id,
          },
          data: {
            name,
            description,
            SourceLanguage: sourceLanguageId
              ? {
                  connect: {
                    id: sourceLanguageId,
                  },
                }
              : undefined,
            TargetLanguages: targetLanguageIds
              ? {
                  set: targetLanguageIds.map((id) => ({
                    id,
                  })),
                }
              : undefined,
          },
        }),
      );
    }),
  create: authedProcedure
    .input(
      z.object({
        name: z.string(),
        description: z.string().nullable(),
        sourceLanguageId: z.string(),
        targetLanguageIds: z.array(z.string()),
        memoryIds: z.array(z.ulid()),
        glossaryIds: z.array(z.ulid()),
        createMemory: z.boolean(),
        createGlossary: z.boolean(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const {
        prismaDB: { client: prisma },
        user,
      } = ctx;
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
        id: z.ulid(),
        glossaryIds: z.array(z.ulid()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
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
  linkMemory: authedProcedure
    .input(
      z.object({
        id: z.ulid(),
        memoryIds: z.array(z.ulid()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const { id, memoryIds } = input;

      await prisma.project.update({
        where: {
          id,
        },
        data: {
          Memories: {
            connect: memoryIds.map((memoryId) => ({
              id: memoryId,
            })),
          },
        },
      });
    }),
  unlinkGlossary: authedProcedure
    .input(
      z.object({
        id: z.ulid(),
        glossaryIds: z.array(z.ulid()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
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
  unlinkMemory: authedProcedure
    .input(
      z.object({
        id: z.ulid(),
        memoryIds: z.array(z.ulid()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const { id, memoryIds } = input;

      await prisma.project.update({
        where: {
          id,
        },
        data: {
          Memories: {
            disconnect: memoryIds.map((memoryId) => ({
              id: memoryId,
            })),
          },
        },
      });
    }),
  listUserOwned: authedProcedure.query(async ({ ctx }) => {
    const {
      prismaDB: { client: prisma },
      user: creator,
    } = ctx;

    return z.array(ProjectSchema).parse(
      await prisma.project.findMany({
        where: {
          creatorId: creator.id,
        },
        include: {
          Creator: true,
          SourceLanguage: true,
          TargetLanguages: true,
          Documents: {
            include: {
              File: true,
            },
          },
        },
      }),
    );
  }),
  listUserParticipated: publicProcedure
    .input(
      z.object({
        userId: z.ulid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const { userId } = input;

      return z.array(ProjectSchema).parse(
        await prisma.project.findMany({
          where: {
            Members: {
              some: {
                id: userId,
              },
            },
          },
          include: {
            Creator: true,
            SourceLanguage: true,
            TargetLanguages: true,
            Documents: {
              include: {
                File: true,
              },
            },
          },
        }),
      );
    }),
  query: authedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .output(ProjectSchema.nullable())
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
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
                File: true,
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
      const {
        prismaDB: { client: prisma },
        user,
      } = ctx;
      const { projectId, languageId } = input;

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
      const {
        prismaDB: { client: prisma },
        user,
      } = ctx;
      const { id } = input;

      await prisma.project.update({
        where: {
          id,
        },
        data: {
          Members: {
            connect: {
              id: user.id,
            },
          },
        },
      });
    }),
  invite: authedProcedure
    .input(
      z.object({
        projectId: z.ulid(),
        userId: z.ulid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
        user: creator,
      } = ctx;
      const { projectId, userId } = input;

      await prisma.project.update({
        where: {
          id: projectId,
          creatorId: creator.id,
        },
        data: {
          Members: {
            connect: {
              id: userId,
            },
          },
        },
      });
    }),
  countElement: authedProcedure
    .input(
      z.object({
        id: z.ulid(),
        isTranslated: z.boolean().optional(),
        isApproved: z.boolean().optional(),
      }),
    )
    .output(z.number().int().min(0))
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const { id, isApproved, isTranslated } = input;

      return await prisma.translatableElement.count({
        where: {
          Document: {
            Project: {
              id,
            },
          },
          Translations:
            isTranslated === undefined && isApproved === undefined
              ? undefined
              : {
                  some: {
                    ...(isTranslated !== undefined ? {} : undefined),
                    ...(isApproved !== undefined
                      ? {
                          Approvments: {
                            some: {
                              isActive: true,
                            },
                          },
                        }
                      : undefined),
                  },
                },
        },
      });
    }),
  countTranslation: authedProcedure
    .input(
      z.object({
        id: z.ulid(),
        languageId: z.string(),
        isApproved: z.boolean().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const { id, languageId, isApproved } = input;

      return await prisma.translation.count({
        where: {
          TranslatableElement: {
            documentId: id,
          },
          languageId,
          Approvments:
            isApproved === undefined
              ? undefined
              : isApproved === true
                ? {
                    some: {
                      isActive: true,
                    },
                  }
                : {
                    none: {
                      isActive: true,
                    },
                  },
        },
      });
    }),
});
