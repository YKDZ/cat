import {
  GlossarySchema,
  TermRelationSchema,
  TermSchema,
  type TermRelation,
} from "@cat/shared/schema/prisma/glossary";
import { TRPCError } from "@trpc/server";
import * as z from "zod/v4";
import { TermDataSchema } from "@cat/shared/schema/misc";
import { UserSchema } from "@cat/shared/schema/prisma/user";
import { authedProcedure, router } from "../server.ts";

export const glossaryRouter = router({
  deleteTerm: authedProcedure
    .input(
      z.object({
        ids: z.array(z.number().int()),
      }),
    )
    .output(z.void())
    .mutation(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
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
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
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

      return relations;
    }),
  get: authedProcedure
    .input(
      z.object({
        id: z.ulid(),
      }),
    )
    .output(
      GlossarySchema.extend({
        Creator: UserSchema,
      }).nullable(),
    )
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const { id } = input;

      return await prisma.glossary.findUnique({
        where: {
          id,
        },
        include: {
          Creator: true,
        },
      });
    }),
  listUserOwned: authedProcedure
    .input(
      z.object({
        userId: z.ulid(),
      }),
    )
    .output(z.array(GlossarySchema))
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const { userId } = input;

      return await prisma.glossary.findMany({
        where: {
          creatorId: userId,
        },
        include: {
          Creator: true,
        },
      });
    }),
  listProjectOwned: authedProcedure
    .input(
      z.object({
        projectId: z.ulid(),
      }),
    )
    .output(z.array(GlossarySchema))
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const { projectId } = input;

      return await prisma.glossary.findMany({
        where: {
          Projects: {
            some: {
              id: projectId,
            },
          },
        },
      });
    }),
  countTerm: authedProcedure
    .input(
      z.object({
        id: z.ulid(),
      }),
    )
    .output(z.number().int())
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
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
    .output(GlossarySchema)
    .mutation(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
        user,
      } = ctx;
      const { name, description, projectIds } = input;

      return await prisma.glossary.create({
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
      });
    }),
  insertTerm: authedProcedure
    .input(
      z.object({
        glossaryId: z.ulid(),
        termsData: z.array(TermDataSchema),
        canReverse: z.boolean().default(true),
      }),
    )
    .output(z.void())
    .mutation(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
        pluginRegistry,
        user,
      } = ctx;
      const { glossaryId, termsData, canReverse } = input;

      // TODO 选择安装的服务或者继承
      const { service: termService } = (await pluginRegistry.getPluginService(
        prisma,
        "es-term-service",
        "TERM_SERVICE",
        "ES",
      ))!;

      if (!termService) throw new Error("Term service does not exists");

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
                translationId: translations[index]!.id,
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
                  termId: translations[index]!.id,
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

        await termService.termStore.insertTerms(...relations);
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
    .output(
      z.array(
        TermRelationSchema.extend({
          Term: TermSchema,
          Translation: TermSchema,
        }),
      ),
    )
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
        pluginRegistry,
      } = ctx;
      const { text, termLanguageId, translationLanguageId } = input;

      // TODO 选择安装的服务或者继承
      const { service: termService } = (await pluginRegistry.getPluginService(
        prisma,
        "es-term-service",
        "TERM_SERVICE",
        "ES",
      ))!;

      if (!termService) throw new Error("Term service does not exists");

      const translationIds = await termService.termStore.searchTerm(
        text,
        termLanguageId,
      );

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

      return relations;
    }),
  findTerm: authedProcedure
    .input(
      z.object({
        elementId: z.number().int(),
        translationLanguageId: z.string(),
      }),
    )
    .output(
      z.array(
        TermRelationSchema.extend({
          Term: TermSchema,
          Translation: TermSchema,
        }),
      ),
    )
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
        pluginRegistry,
      } = ctx;
      const { elementId, translationLanguageId } = input;

      // TODO 选择安装的服务或者继承
      const { service: termService } = (await pluginRegistry.getPluginService(
        prisma,
        "es-term-service",
        "TERM_SERVICE",
        "ES",
      ))!;

      if (!termService) throw new Error("Term service does not exists");

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

      const sourceLanguageId = element.Document!.Project.sourceLanguageId;

      const translationIds = await termService.termStore.searchTerm(
        element.value,
        sourceLanguageId,
      );
      const glossaryIds = element.Document!.Project.Glossaries.map(
        (glossary) => glossary.id,
      );

      const relations = await prisma.termRelation.findMany({
        where: {
          Term: {
            Glossary: {
              id: {
                in: glossaryIds,
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
                in: glossaryIds,
              },
            },
            languageId: translationLanguageId,
          },
        },
        include: {
          Term: true,
          Translation: true,
        },
      });

      return relations;
    }),
});
