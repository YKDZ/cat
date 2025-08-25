import { z } from "zod";
import { authedProcedure, router } from "../server";
import { TRPCError } from "@trpc/server";
import {
  logger,
  TranslationApprovementSchema,
  TranslationSchema,
  TranslationVoteSchema,
} from "@cat/shared";
import { autoTranslateQueue } from "@/server/processor/autoTranslate";
import { createTranslationQueue } from "@/server/processor/createTranslation";
import { updateTranslationQueue } from "@/server/processor/updateTranslation";

export const translationRouter = router({
  delete: authedProcedure
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
        projectId: z.ulid(),
        elementId: z.number().int(),
        languageId: z.string(),
        value: z.string(),
        createMemory: z.boolean().default(true),
      }),
    )
    .output(
      TranslationSchema.extend({
        status: z.enum(["PROCESSING", "COMPLETED"]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const {
        prismaDB: { client: prisma },
        user,
        pluginRegistry,
      } = ctx;
      const { projectId, elementId, languageId, value, createMemory } = input;

      return await prisma.$transaction(async (tx) => {
        const project = await tx.project.findUnique({
          where: { id: projectId },
          include: {
            Memories: {
              select: { id: true },
            },
          },
        });

        if (!project)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Project not found",
          });

        const vectorizer = (await pluginRegistry.getTextVectorizers(prisma))
          .map((d) => d.vectorizer)
          .find((vectorizer) =>
            vectorizer.canVectorize(project.sourceLanguageId),
          );

        if (!vectorizer) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "CAT 没有可以处理这种文本的向量化器",
          });
        }

        const task = await tx.task.create({
          data: {
            type: "create_translation",
          },
        });

        await createTranslationQueue.add(
          task.id,
          {
            createMemory,
            elementId: elementId,
            creatorId: user.id,
            translationLanguageId: languageId,
            translationValue: value,
            vectorizerId: vectorizer.getId(),
            memoryIds: project.Memories.map((memory) => memory.id),
          },
          {
            jobId: task.id,
          },
        );

        return TranslationSchema.extend({
          status: z.enum(["PROCESSING", "COMPLETED"]),
        }).parse({
          id: 0, // Placeholder ID, will be updated later
          embeddingId: 0, // Placeholder ID, will be updated later
          meta: null,
          value,
          languageId,
          translatableElementId: elementId,
          translatorId: user.id,
          createdAt: new Date(),
          updatedAt: new Date(),
          status: "PROCESSING",
        });
      });
    }),
  update: authedProcedure
    .input(
      z.object({
        id: z.number().int(),
        value: z.string(),
      }),
    )
    .output(
      TranslationSchema.extend({ status: z.enum(["PROCESSING", "COMPLETED"]) }),
    )
    .mutation(async ({ input, ctx }) => {
      const {
        prismaDB: { client: prisma },
        pluginRegistry,
      } = ctx;
      const { id, value } = input;

      const translation = await prisma.translation.findUnique({
        where: {
          id,
        },
        select: {
          id: true,
          embeddingId: true,
          languageId: true,
          translatableElementId: true,
          translatorId: true,
          createdAt: true,
        },
      });

      if (!translation)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Translation with given id not found",
        });

      const vectorizer = (await pluginRegistry.getTextVectorizers(prisma))
        .map((d) => d.vectorizer)
        .find((vectorizer) => vectorizer.canVectorize(translation.languageId));

      if (!vectorizer) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "CAT 没有可以处理这种文本的向量化器",
        });
      }

      const task = await prisma.task.create({
        data: {
          type: "update_translation",
        },
      });

      await updateTranslationQueue
        .add(
          task.id,
          {
            translationId: id,
            translationValue: value,
            vectorizerId: vectorizer.getId(),
          },
          {
            jobId: task.id,
          },
        )
        .catch(async (e) => {
          logger.error(
            "RPC",
            { msg: "Failed to add update translation job to queue" },
            e,
          );
          await prisma.task.update({
            where: { id: task.id },
            data: { status: "failed" },
          });
        });

      return TranslationSchema.extend({
        status: z.enum(["PROCESSING", "COMPLETED"]),
      }).parse({
        id: translation.id,
        embeddingId: translation.embeddingId,
        meta: null,
        value,
        languageId: translation.languageId,
        translatableElementId: translation.translatableElementId,
        translatorId: translation.translatorId,
        createdAt: translation.createdAt,
        updatedAt: new Date(),
        status: "PROCESSING",
      });
    }),
  queryAll: authedProcedure
    .input(
      z.object({
        elementId: z.number().int(),
        languageId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const { elementId, languageId } = input;

      const translations = await prisma.translation.findMany({
        where: {
          languageId: languageId,
          translatableElementId: elementId,
        },
        include: {
          Translator: true,
          Approvements: true,
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
      const {
        prismaDB: { client: prisma },
        user,
      } = ctx;
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
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
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
      const {
        prismaDB: { client: prisma },
        user,
      } = ctx;
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
        documentId: z.ulid(),
        languageId: z.string(),
      }),
    )
    .output(z.number())
    .mutation(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
        user,
      } = ctx;
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
                    Approvements: {
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
          await tx.translationApprovement.createMany({
            data: translationIds.map((id) => ({
              translationId: id,
              isActive: true,
              creatorId: user.id,
            })),
          })
        ).count;
      });
    }),
  approve: authedProcedure
    .input(
      z.object({
        id: z.int(),
      }),
    )
    .output(TranslationApprovementSchema)
    .mutation(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
        user,
      } = ctx;
      const { id } = input;

      return await prisma.$transaction(async (tx) => {
        const exists = await tx.translation.count({
          where: {
            id,
            TranslatableElement: {
              Translations: {
                some: {
                  Approvements: {
                    some: {
                      isActive: true,
                    },
                  },
                },
              },
            },
          },
        });

        if (exists > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Some translations already have active approvment",
          });
        }

        return TranslationApprovementSchema.parse(
          await tx.translationApprovement.create({
            data: {
              translationId: id,
              isActive: true,
              creatorId: user.id,
            },
          }),
        );
      });
    }),
  unapprove: authedProcedure
    .input(
      z.object({
        id: z.int(),
      }),
    )
    .output(TranslationApprovementSchema)
    .mutation(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const { id } = input;

      return TranslationApprovementSchema.parse(
        await prisma.translationApprovement.update({
          where: {
            id,
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
      const {
        prismaDB: { client: prisma },
        user,
        pluginRegistry,
      } = ctx;
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

      const advisorData = (
        await pluginRegistry.getTranslationAdvisors(prisma, {
          userId: user.id,
        })
      ).find(({ advisor }) => advisor.getId() === advisorId);

      if (!advisorData)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Advisor with given id does not exists",
        });

      const vectorizer = (await pluginRegistry.getTextVectorizers(prisma))
        .map((d) => d.vectorizer)
        .find((vectorizer) => vectorizer.canVectorize(languageId));

      if (!vectorizer)
        throw new Error(`No vectorizer can vectorize the translation`);

      const task = await prisma.task.create({
        data: {
          type: "auto_translate",
          meta: {
            projectId: document.Project.id,
            documentId,
          },
        },
      });

      await autoTranslateQueue.add(
        task.id,
        {
          userId: user.id,
          documentId,
          advisorId,
          advisorPluginId: advisorData.pluginId,
          vectorizerId: vectorizer.getId(),
          languageId,
          minMemorySimilarity,
        },
        {
          jobId: task.id,
        },
      );
    }),
});
