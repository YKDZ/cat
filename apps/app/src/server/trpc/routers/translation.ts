import { z } from "zod/v4";
import { authedProcedure, router } from "../server";
import { TRPCError } from "@trpc/server";
import { prisma } from "@cat/db";
import { TranslationSchema, TranslationVoteSchema } from "@cat/shared";

export const translationRouter = router({
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
  create: authedProcedure
    .input(
      z.object({
        projectId: z.cuid2(),
        elementId: z.number().int(),
        languageId: z.string(),
        value: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { user } = ctx;
      const { projectId, elementId, languageId, value } = input;

      const translation = await prisma.$transaction(async () => {
        const translation = await prisma.translation.create({
          data: {
            value,
            TranslatableElement: {
              connect: {
                id: elementId,
              },
            },
            Language: {
              connect: {
                id: languageId,
              },
            },
            Translator: {
              connect: {
                id: user.id,
              },
            },
          },
          include: {
            Translator: true,
          },
        });

        const element = await prisma.translatableElement.findUniqueOrThrow({
          where: {
            id: elementId,
          },
          include: {
            Document: {
              include: {
                Project: true,
              },
            },
          },
        });

        const projectWithMemories = await prisma.project.findUnique({
          where: { id: projectId },
          include: {
            Memories: {
              select: { id: true },
            },
          },
        });

        if (projectWithMemories) {
          // 在项目的每一个记忆库中都创建一个记忆条目
          await prisma.memoryItem.createMany({
            data: projectWithMemories.Memories.map((memory) => {
              return {
                source: element.value,
                sourceLanguageId: element.Document.Project.sourceLanguageId,
                translation: translation.value,
                translationLanguageId: translation.languageId,
                memoryId: memory.id,
                sourceEmbeddingId: element?.embeddingId,
                creatorId: user.id,
                sourceElementId: element.id,
                translationId: translation.id,
              };
            }),
          });
        }

        return translation;
      });

      return TranslationSchema.parse(translation);
    }),
  update: authedProcedure
    .input(
      z.object({
        id: z.number().int(),
        value: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { user } = ctx;
      const { id, value } = input;

      const translation = await prisma.$transaction(async (tx) => {
        const translation = await tx.translation.update({
          where: {
            id,
            translatorId: user.id,
          },
          data: {
            value,
          },
          include: {
            Translator: true,
          },
        });

        await tx.memoryItem.updateMany({
          where: {
            translationId: translation.id,
          },
          data: {
            translation: translation.value,
          },
        });

        return translation;
      });

      return TranslationSchema.parse(translation);
    }),
  queryAll: authedProcedure
    .input(
      z.object({
        elementId: z.number().int(),
        languageId: z.string(),
      }),
    )
    .query(async ({ input }) => {
      const { elementId, languageId } = input;

      const translations = await prisma.translation.findMany({
        where: {
          languageId: languageId,
          translatableElementId: elementId,
        },
        include: {
          Translator: true,
        },
      });

      return z.array(TranslationSchema).parse(translations);
    }),
  vote: authedProcedure
    .input(
      z.object({
        id: z.number().int(),
        value: z.number().int(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { user } = ctx;
      const { id, value } = input;

      return TranslationVoteSchema.parse(
        await prisma.translationVote.upsert({
          where: {
            oneVotePerUserUniqueTranslation: {
              translationId: id,
              voterId: user.id,
            },
          },
          create: {
            value,
            Translation: {
              connect: {
                id,
              },
            },
            Voter: {
              connect: {
                id: user.id,
              },
            },
          },
          update: {
            value,
            Translation: {
              connect: {
                id,
              },
            },
            Voter: {
              connect: {
                id: user.id,
              },
            },
          },
        }),
      );
    }),
  countVote: authedProcedure
    .input(
      z.object({
        id: z.number().int(),
      }),
    )
    .output(z.number().int())
    .query(async ({ input }) => {
      const { id } = input;

      const votes = await prisma.translationVote.findMany({
        where: {
          translationId: id,
        },
      });

      return votes
        .map((vote) => vote.value)
        .reduce((value, current) => value + current, 0);
    }),
  querySelfVote: authedProcedure
    .input(
      z.object({
        id: z.number().int(),
      }),
    )
    .output(TranslationVoteSchema.nullable())
    .query(async ({ ctx, input }) => {
      const { user } = ctx;
      const { id } = input;

      return TranslationVoteSchema.nullable().parse(
        await prisma.translationVote.findUnique({
          where: {
            oneVotePerUserUniqueTranslation: {
              translationId: id,
              voterId: user.id,
            },
          },
        }),
      );
    }),
  updateApproved: authedProcedure
    .input(
      z.object({
        id: z.int(),
        isApproved: z.boolean(),
      }),
    )
    .mutation(async ({ input }) => {
      const { id, isApproved } = input;
      await prisma.translation.update({
        where: {
          id,
        },
        data: {
          isApproved,
        },
      });
    }),
});
