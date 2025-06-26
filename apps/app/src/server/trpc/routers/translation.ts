import { z } from "zod/v4";
import { authedProcedure, router } from "../server";
import { TRPCError } from "@trpc/server";
import { prisma } from "@cat/db";
import {
  TranslationApprovmentSchema,
  TranslationSchema,
  TranslationVoteSchema,
} from "@cat/shared";
import { autoTranslateQueue } from "@/server/processor/autoTranslate";

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
        createMemory: z.boolean().default(true),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { user } = ctx;
      const { projectId, elementId, languageId, value, createMemory } = input;

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

        if (createMemory && projectWithMemories) {
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
          Approvments: true,
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
  autoApprove: authedProcedure
    .input(
      z.object({
        documentId: z.cuid2(),
        languageId: z.string(),
      }),
    )
    .output(z.number())
    .mutation(async ({ input }) => {
      const { documentId, languageId } = input;

      return await prisma.$transaction(async (tx) => {
        const translationIds = (
          await prisma.translatableElement.findMany({
            where: {
              documentId,
              // 至少有一个指定语言的翻译
              Translations: {
                some: {
                  languageId,
                },
              },
              // 所有的翻译都没有被采用
              NOT: {
                Translations: {
                  some: {
                    Approvments: {
                      some: {
                        isActive: true,
                      },
                    },
                  },
                },
              },
            },
            select: {
              Translations: {
                select: {
                  id: true,
                },
                orderBy: {
                  Votes: {
                    _count: "desc",
                  },
                },
                take: 1,
              },
            },
          })
        ).map((element) => element.Translations[0].id);

        return (
          await tx.translationApprovment.createMany({
            data: translationIds.map((id) => ({
              translationId: id,
              isActive: true,
            })),
          })
        ).count;
      });
    }),
  approve: authedProcedure
    .input(
      z.object({
        ids: z.array(z.int()),
      }),
    )
    .output(z.array(TranslationApprovmentSchema))
    .mutation(async ({ input }) => {
      const { ids } = input;

      return await prisma.$transaction(async (tx) => {
        const alreayApprovedTranslations = await tx.translation.findMany({
          where: {
            id: {
              in: ids,
            },
            Approvments: {
              some: {
                isActive: true,
              },
            },
          },
        });

        if (alreayApprovedTranslations.length > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Some translations alreay have active approvment",
          });
        }

        return z.array(TranslationApprovmentSchema).parse(
          await tx.translationApprovment.createManyAndReturn({
            data: ids.map((id) => ({
              translationId: id,
              isActive: true,
            })),
          }),
        );
      });
    }),
  unapprove: authedProcedure
    .input(
      z.object({
        ids: z.array(z.int()),
      }),
    )
    .output(z.array(TranslationApprovmentSchema))
    .mutation(async ({ input }) => {
      const { ids } = input;

      return z.array(TranslationApprovmentSchema).parse(
        await prisma.translationApprovment.updateManyAndReturn({
          where: {
            translationId: {
              in: ids,
            },
          },
          data: {
            isActive: false,
          },
        }),
      );
    }),
  autoTranslate: authedProcedure
    .input(
      z.object({
        documentId: z.string(),
        advisorId: z.string().nullable(),
        languageId: z.string(),
        minMemorySimilarity: z.number().default(0.72),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { user, pluginRegistry } = ctx;
      const { documentId, advisorId, languageId, minMemorySimilarity } = input;

      const document = await prisma.document.findUnique({
        where: {
          id: documentId,
          Project: {
            TargetLanguages: {
              some: {
                id: languageId,
              },
            },
          },
        },
        select: {
          Project: {
            select: {
              id: true,
            },
          },
        },
      });

      if (!document)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Document does not exists or language does not claimed in project",
        });

      if (advisorId) {
        const advisor = (
          await pluginRegistry.getTranslationAdvisors({
            userId: user.id,
          })
        ).find((advisor) => advisor.getId() === advisorId);

        if (!advisor)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Advisor with given id does not exists",
          });

        if (!advisor.isEnabled())
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Advisor with given id does not enabled",
          });
      }

      const task = await prisma.task.create({
        data: {
          type: "auto_translate",
          meta: {
            projectId: document.Project.id,
            documentId,
          },
        },
      });

      await autoTranslateQueue.add(task.id, {
        taskId: task.id,
        userId: user.id,
        documentId,
        advisorId,
        languageId,
        minMemorySimilarity,
      });
    }),
});
