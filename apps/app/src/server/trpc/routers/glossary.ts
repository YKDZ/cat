import { prisma } from "@cat/db";
import type { TermRelation } from "@cat/shared";
import {
  GlossarySchema,
  TermDataSchema,
  TermRelationSchema,
} from "@cat/shared";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";
import { authedProcedure, router } from "../server";
import { EsTermStore } from "@/server/utils/es";

export const glossaryRouter = router({
  deleteTerm: authedProcedure
    .input(
      z.object({
        ids: z.array(z.number().int()),
      }),
    )
    .mutation(async ({ input }) => {
      const { ids } = input;

      await prisma.term.deleteMany({
        where: {
          id: {
            in: ids,
          },
        },
      });
    }),
  queryTerms: authedProcedure
    .input(
      z.object({
        id: z.ulid(),
        sourceLanguageId: z.string().nullable(),
        translationLanguageId: z.string().nullable(),
      }),
    )
    .output(z.array(TermRelationSchema))
    .query(async ({ input }) => {
      const { id, sourceLanguageId, translationLanguageId } = input;

      const relations = await prisma.termRelation.findMany({
        where: {
          Term: {
            languageId: sourceLanguageId ? sourceLanguageId : undefined,
            Glossary: {
              id,
            },
          },
          Translation: {
            languageId: translationLanguageId
              ? translationLanguageId
              : undefined,
            Glossary: {
              id,
            },
          },
        },
        include: {
          Term: {
            include: {
              Language: true,
            },
          },
          Translation: {
            include: {
              Language: true,
            },
          },
        },
        orderBy: translationLanguageId
          ? {
              Term: {
                value: "asc",
              },
            }
          : {
              Translation: {
                value: "asc",
              },
            },
      });

      return z.array(TermRelationSchema).parse(relations);
    }),
  query: authedProcedure
    .input(
      z.object({
        id: z.ulid(),
      }),
    )
    .output(GlossarySchema.nullable())
    .query(async ({ input }) => {
      const { id } = input;

      return GlossarySchema.nullable().parse(
        await prisma.glossary.findUnique({
          where: {
            id,
          },
          include: {
            Creator: true,
          },
        }),
      );
    }),
  listUserOwned: authedProcedure
    .input(
      z.object({
        userId: z.ulid(),
      }),
    )
    .output(z.array(GlossarySchema))
    .query(async ({ input }) => {
      const { userId } = input;

      return z.array(GlossarySchema).parse(
        await prisma.glossary.findMany({
          where: {
            creatorId: userId,
          },
          include: {
            Creator: true,
          },
        }),
      );
    }),
  listProjectOwned: authedProcedure
    .input(
      z.object({
        projectId: z.ulid(),
      }),
    )
    .output(z.array(GlossarySchema))
    .query(async ({ input }) => {
      const { projectId } = input;

      return z.array(GlossarySchema).parse(
        await prisma.glossary.findMany({
          where: {
            Projects: {
              some: {
                id: projectId,
              },
            },
          },
          include: {
            Creator: true,
          },
        }),
      );
    }),
  countTerm: authedProcedure
    .input(
      z.object({
        id: z.ulid(),
      }),
    )
    .output(z.number().int())
    .query(async ({ input }) => {
      const { id } = input;

      return await prisma.term.count({
        where: {
          Glossary: {
            id,
          },
        },
      });
    }),
  create: authedProcedure
    .input(
      z.object({
        name: z.string(),
        description: z.string().optional(),
        projectIds: z.array(z.ulid()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { user } = ctx;
      const { name, description, projectIds } = input;

      return GlossarySchema.parse(
        await prisma.glossary.create({
          data: {
            name,
            description,
            Creator: {
              connect: {
                id: user.id,
              },
            },
            Projects: {
              connect: projectIds
                ? projectIds.map((projectId) => ({
                    id: projectId,
                  }))
                : undefined,
            },
          },
        }),
      );
    }),
  insertTerm: authedProcedure
    .input(
      z.object({
        glossaryId: z.ulid(),
        termsData: z.array(TermDataSchema),
        canReverse: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { user } = ctx;
      const { glossaryId, termsData, canReverse } = input;

      await prisma.$transaction(async (tx) => {
        const terms = await Promise.all(
          termsData.map((term) =>
            tx.term.create({
              data: {
                value: term.term,
                languageId: term.termLanguageId,
                creatorId: user.id,
                glossaryId,
              },
            }),
          ),
        );

        const translations = await Promise.all(
          termsData.map((term) =>
            tx.term.create({
              data: {
                value: term.translation,
                languageId: term.translationLanguageId,
                creatorId: user.id,
                glossaryId,
              },
            }),
          ),
        );

        const relations: TermRelation[] = [];

        relations.push(
          ...z.array(TermRelationSchema).parse(
            await tx.termRelation.createManyAndReturn({
              data: terms.map((term, index) => ({
                termId: term.id,
                translationId: translations[index].id,
              })),
              include: {
                Term: {
                  include: {
                    Language: true,
                  },
                },
                Translation: {
                  include: {
                    Language: true,
                  },
                },
              },
            }),
          ),
        );

        if (canReverse)
          relations.push(
            ...z.array(TermRelationSchema).parse(
              await tx.termRelation.createManyAndReturn({
                data: terms.map((term, index) => ({
                  termId: translations[index].id,
                  translationId: term.id,
                })),
                include: {
                  Term: {
                    include: {
                      Language: true,
                    },
                  },
                  Translation: {
                    include: {
                      Language: true,
                    },
                  },
                },
              }),
            ),
          );

        await EsTermStore.insertTerms(...relations);
      });
    }),
  searchTerm: authedProcedure
    .input(
      z.object({
        text: z.string(),
        termLanguageId: z.string(),
        translationLanguageId: z.string(),
      }),
    )
    .output(z.array(TermRelationSchema))
    .query(async ({ input }) => {
      const { text, termLanguageId, translationLanguageId } = input;
      const translationIds = await EsTermStore.searchTerm(text, termLanguageId);

      const relations = await prisma.termRelation.findMany({
        where: {
          Translation: {
            id: {
              in: translationIds,
            },
            languageId: translationLanguageId,
          },
        },
        include: {
          Term: true,
          Translation: true,
        },
      });

      return z.array(TermRelationSchema).parse(relations);
    }),
  findTerm: authedProcedure
    .input(
      z.object({
        elementId: z.number().int(),
        translationLanguageId: z.string(),
      }),
    )
    .output(z.array(TermRelationSchema))
    .query(async ({ input }) => {
      const { elementId, translationLanguageId } = input;

      const element = await prisma.translatableElement.findUnique({
        where: {
          id: elementId,
        },
        include: {
          Document: {
            include: {
              Project: {
                include: {
                  Glossaries: true,
                },
              },
            },
          },
        },
      });

      if (!element)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "请求术语的元素不存在",
        });

      const sourceLanguageId = element.Document.Project.sourceLanguageId;

      const translationIds = await EsTermStore.searchTerm(
        element.value,
        sourceLanguageId,
      );
      const glossariesIds = element.Document.Project.Glossaries.map(
        (glossary) => glossary.id,
      );

      const relations = await prisma.termRelation.findMany({
        where: {
          Term: {
            Glossary: {
              id: {
                in: glossariesIds,
              },
            },
            languageId: sourceLanguageId,
          },
          Translation: {
            id: {
              in: translationIds,
            },
            Glossary: {
              id: {
                in: glossariesIds,
              },
            },
            languageId: translationLanguageId,
          },
        },
        include: {
          Term: {
            include: {
              Glossary: true,
            },
          },
          Translation: {
            include: {
              Glossary: true,
            },
          },
        },
      });

      return z.array(TermRelationSchema).parse(relations);
    }),
});
