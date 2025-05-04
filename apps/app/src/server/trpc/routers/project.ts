import { z } from "zod";
import { authedProcedure, router } from "../server";
import { TRPCError } from "@trpc/server";
import { prisma } from "@cat/db";
import { PrismaError, ProjectSchema } from "@cat/shared";

export const projectRouter = router({
  create: authedProcedure
    .input(
      z.object({
        name: z.string(),
        description: z.string().optional(),
        languageId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { name, description, languageId } = input;
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
                id: languageId,
              },
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
  listParticipated: authedProcedure.query(async ({ input, ctx }) => {
    const { user } = ctx;

    const participated = await prisma.project.findMany({
      where: {
        OR: [
          {
            ProjectPermissions: {
              some: {
                userId: user.id,
                permission: "translate",
              },
            },
          },
          {
            creatorId: user.id,
          },
        ],
      },
      include: {
        Creator: true,
        SourceLanguage: true,
        TargetLanguages: true,
        Documents: {
          include: {
            Type: true,
            File: true,
          },
        },
      },
    });

    return z.array(ProjectSchema).parse(participated);
  }),
  query: authedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { id } = input;

      return ProjectSchema.parse(
        await prisma.project
          .findUniqueOrThrow({
            where: {
              id,
            },
            include: {
              Creator: true,
              TargetLanguages: true,
              SourceLanguage: true,
              Documents: {
                include: {
                  Type: true,
                  File: true,
                },
              },
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

      await prisma.projectPermission.create({
        data: {
          projectId: id,
          userId: user.id,
          permission: "translate",
        },
      });
    }),
});
