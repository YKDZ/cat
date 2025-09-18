import { join } from "node:path";
import { TRPCError } from "@trpc/server";
import * as z from "zod/v4";
import { sanitizeFileName } from "@cat/db";
import type { PrismaError } from "@cat/shared/schema/misc";
import {
  ElementTranslationStatusSchema,
  FileMetaSchema,
} from "@cat/shared/schema/misc";
import { FileSchema } from "@cat/shared/schema/prisma/file";
import {
  DocumentSchema,
  DocumentVersionSchema,
  TranslatableElementSchema,
} from "@cat/shared/schema/prisma/document";
import type { JSONType } from "@cat/shared/schema/json";
import { authedProcedure, router } from "@/server/trpc/server.ts";
import { exportTranslatedFileQueue } from "@/server/processor/exportTranslatedFile.ts";
import { useStorage } from "@/server/utils/storage/useStorage.ts";
import { upsertDocumentElementsFromFileQueue } from "@/server/processor/upsertDocumentElementsFromFile.ts";

export const documentRouter = router({
  fileUploadURL: authedProcedure
    .input(
      z.object({
        meta: FileMetaSchema,
      }),
    )
    .output(
      z.object({
        url: z.url(),
        file: FileSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const { meta } = input;
      const storageResult = await useStorage(
        prisma,
        "s3-storage-provider",
        "S3",
        "GLOBAL",
        "",
      );
      const { id: providerId, provider } = storageResult;

      const name = sanitizeFileName(meta.name);

      const path = join(provider.getBasicPath(), "documents", name);

      // TODO 校验文件类型
      const file = await prisma.file.create({
        data: {
          originName: meta.name,
          storedPath: path,
          storageProviderId: providerId,
        },
      });

      const url = await provider.generateUploadURL(path, 120);

      return {
        url,
        file: FileSchema.parse(file),
      };
    }),
  createFromFile: authedProcedure
    .input(
      z.object({
        projectId: z.string(),
        fileId: z.number().int(),
      }),
    )
    .output(DocumentSchema)
    .mutation(async ({ input, ctx }) => {
      const { projectId, fileId } = input;
      const {
        prismaDB: { client: prisma },
        user,
        pluginRegistry,
      } = ctx;

      const dbProject = await prisma.project.findUniqueOrThrow({
        where: { id: projectId },
        select: {
          sourceLanguageId: true,
        },
      });

      const vectorizer = (
        await pluginRegistry.getPluginServices(prisma, "TEXT_VECTORIZER")
      ).find(({ service }) => service.canVectorize(dbProject.sourceLanguageId));

      if (!vectorizer) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No vectorizer found for project's source language",
        });
      }

      const existDocument = await prisma.document.findFirst({
        where: {
          projectId,
          File: {
            id: fileId,
          },
        },
      });

      if (!existDocument) {
        const dbFile = await prisma.file.findUniqueOrThrow({
          where: {
            id: fileId,
          },
        });

        const { id: fileHandlerId } = (
          await pluginRegistry.getPluginServices(
            prisma,
            "TRANSLATABLE_FILE_HANDLER",
          )
        ).find(({ service }) => service.canExtractElement(dbFile))!;

        const document = await prisma.document.create({
          data: {
            creatorId: user.id,
            projectId,
            fileHandlerId,
            File: {
              connect: {
                id: fileId,
              },
            },
            Versions: {
              create: {},
            },
            Tasks: {
              create: {
                type: "upsertDocumentElementsFromFile",
              },
            },
          },
          include: {
            Tasks: true,
          },
        });

        await upsertDocumentElementsFromFileQueue.add(document.Tasks[0]!.id, {
          documentId: document.id,
          fileId,
          vectorizerId: vectorizer.id,
        });

        return document;
      } else {
        const task = await prisma.task.create({
          data: {
            type: "upsertDocumentElementsFromFile",
          },
        });

        const document = await prisma.document.update({
          where: {
            id: existDocument.id,
          },
          data: {
            Tasks: {
              connect: { id: task.id },
            },
          },
          include: {
            Tasks: true,
          },
        });

        await upsertDocumentElementsFromFileQueue.add(task.id, {
          documentId: existDocument.id,
          fileId,
          vectorizerId: vectorizer.id,
        });

        return document;
      }
    }),
  query: authedProcedure
    .input(z.object({ id: z.string() }))
    .output(DocumentSchema.nullable())
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const { id } = input;

      const document = await prisma.document
        .findUnique({
          where: {
            id,
          },
          include: {
            File: true,
          },
        })
        .catch((e: PrismaError) => {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            cause: e,
            message: e.message,
          });
        });

      return document;
    }),
  countElement: authedProcedure
    .input(
      z.object({
        id: z.string(),
        searchQuery: z.string().default(""),
        isApproved: z.boolean().optional(),
        isTranslated: z.boolean().optional(),
      }),
    )
    .output(z.int().min(0))
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const { id, searchQuery, isApproved, isTranslated } = input;

      if (isApproved !== undefined && isTranslated !== true) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "isTranslated must be true when isApproved is set",
        });
      }

      return await prisma.translatableElement.count({
        where: {
          documentId: id,
          value:
            searchQuery.trim().length !== 0
              ? { contains: searchQuery, mode: "insensitive" }
              : undefined,

          Translations:
            isTranslated === undefined && isApproved === undefined
              ? undefined
              : isTranslated === false && isApproved === undefined
                ? {
                    none: {},
                  }
                : isTranslated === true && isApproved === undefined
                  ? {
                      some: {},
                    }
                  : isTranslated === true && isApproved === false
                    ? {
                        some: {
                          Approvements: {
                            none: {},
                          },
                        },
                      }
                    : isTranslated === true && isApproved === true
                      ? {
                          some: {
                            Approvements: {
                              some: {
                                isActive: true,
                              },
                            },
                          },
                        }
                      : undefined,
        },
      });
    }),
  queryFirstElement: authedProcedure
    .input(
      z.object({
        documentId: z.string(),
        searchQuery: z.string().default(""),
        greaterThan: z.int().optional(),
        isApproved: z.boolean().optional(),
        isTranslated: z.boolean().optional(),
      }),
    )
    .output(TranslatableElementSchema.nullable())
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const { documentId, searchQuery, greaterThan, isApproved, isTranslated } =
        input;

      if (isApproved !== undefined && isTranslated !== true) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "isTranslated must be true when isApproved is set",
        });
      }

      const element = await prisma.translatableElement.findFirst({
        where: {
          documentId,
          value:
            searchQuery.trim().length !== 0
              ? { contains: searchQuery, mode: "insensitive" }
              : {},
          sortIndex: {
            gt: greaterThan,
          },

          Translations:
            isTranslated === undefined && isApproved === undefined
              ? undefined
              : isTranslated === false && isApproved === undefined
                ? {
                    none: {},
                  }
                : isTranslated === true && isApproved === undefined
                  ? {
                      some: {},
                    }
                  : isTranslated === true && isApproved === false
                    ? {
                        some: {
                          Approvements: {
                            none: {},
                          },
                        },
                      }
                    : isTranslated === true && isApproved === true
                      ? {
                          some: {
                            Approvements: {
                              some: {
                                isActive: true,
                              },
                            },
                          },
                        }
                      : undefined,
        },
        orderBy: {
          sortIndex: "asc",
        },
      });

      return element;
    }),
  exportTranslatedFile: authedProcedure
    .input(
      z.object({
        documentId: z.string(),
        languageId: z.string(),
      }),
    )
    .output(z.void())
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const { documentId, languageId } = input;

      const document = await prisma.document.findFirst({
        where: {
          id: documentId,
        },
        select: {
          projectId: true,
          File: {
            select: {
              id: true,
            },
          },
          FileHandler: {
            select: {
              id: true,
            },
          },
        },
      });

      if (!document)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "指定文档不存在",
        });

      if (!document.File || !document.FileHandler)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "指定文档不是基于文件的",
        });

      const task = await prisma.task.create({
        data: {
          type: "export_translated_file",
          meta: {
            projectId: document.projectId,
            documentId,
            languageId,
          },
        },
      });

      await exportTranslatedFileQueue.add(
        task.id,
        {
          projectId: document.projectId,
          documentId,
          languageId,
        },
        {
          jobId: task.id,
        },
      );
    }),
  downloadTranslatedFile: authedProcedure
    .input(
      z.object({
        taskId: z.ulid(),
      }),
    )
    .output(
      z.object({
        fileName: z.string(),
        url: z.url(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const { taskId } = input;

      const task = await prisma.task.findFirst({
        where: {
          type: "export_translated_file",
          id: taskId,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      if (!task)
        throw new TRPCError({
          message: "Do not find export task for this document and language",
          code: "BAD_REQUEST",
        });
      if (task.status !== "completed")
        throw new TRPCError({
          message:
            task.status === "failed"
              ? "Task failed. Please retry or check console log"
              : "Do not find export task for this document and language",
          code: "BAD_REQUEST",
        });

      const storageResult = await useStorage(
        prisma,
        "s3-storage-provider",
        "S3",
        "GLOBAL",
        "",
      );
      const { provider } = storageResult;
      const { fileId } = task.meta as {
        fileId: number;
      };

      const file = await prisma.file.findUnique({
        where: {
          id: fileId,
        },
        select: {
          storedPath: true,
          originName: true,
        },
      });

      if (!file)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "File does not exists",
        });

      const url = await provider.generateDownloadURL(
        file.storedPath,
        file.originName,
        60,
      );

      return {
        url,
        fileName: file.originName,
      };
    }),
  queryElementTranslationStatus: authedProcedure
    .input(
      z.object({
        elementId: z.number(),
        languageId: z.string(),
      }),
    )
    .output(ElementTranslationStatusSchema)
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const { elementId, languageId } = input;

      const element = await prisma.translatableElement.findUnique({
        where: {
          id: elementId,
        },
        include: {
          Translations: {
            where: {
              languageId,
            },
            select: {
              Approvements: {
                where: {
                  isActive: true,
                },
              },
            },
          },
        },
      });

      if (!element)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "指定元素不存在",
        });

      if (element.Translations.length === 0) {
        return "NO";
      }

      return element.Translations.findIndex(
        (translation) => translation.Approvements.length > 0,
      ) === -1
        ? "TRANSLATED"
        : "APPROVED";
    }),
  queryElements: authedProcedure
    .input(
      z.object({
        documentId: z.string(),
        page: z.number().int().int().default(0),
        pageSize: z.number().int().int().default(16),
        searchQuery: z.string().default(""),
        isApproved: z.boolean().optional(),
        isTranslated: z.boolean().optional(),
      }),
    )
    .output(z.array(TranslatableElementSchema))
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const {
        documentId,
        page,
        pageSize,
        searchQuery,
        isApproved,
        isTranslated,
      } = input;

      if (isApproved !== undefined && isTranslated !== true) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "isTranslated must be true when isApproved is set",
        });
      }

      const result = await prisma.translatableElement.findMany({
        where: {
          documentId: documentId,
          value:
            searchQuery?.trim().length !== 0
              ? { contains: searchQuery }
              : undefined,

          Translations:
            isTranslated === undefined && isApproved === undefined
              ? undefined
              : isTranslated === false && isApproved === undefined
                ? {
                    none: {},
                  }
                : isTranslated === true && isApproved === undefined
                  ? {
                      some: {},
                    }
                  : isTranslated === true && isApproved === false
                    ? {
                        some: {
                          Approvements: {
                            none: {},
                          },
                        },
                      }
                    : isTranslated === true && isApproved === true
                      ? {
                          some: {
                            Approvements: {
                              some: {
                                isActive: true,
                              },
                            },
                          },
                        }
                      : undefined,
        },
        orderBy: {
          sortIndex: "asc",
        },
        skip: page * pageSize,
        take: pageSize,
      });

      return result;
    }),
  queryPageIndexOfElement: authedProcedure
    .input(
      z.object({
        elementId: z.number(),
        documentId: z.string(),
        pageSize: z.number().int().default(16),
        searchQuery: z.string().default(""),
        isApproved: z.boolean().optional(),
        isTranslated: z.boolean().optional(),
      }),
    )
    .output(z.number().int())
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;

      const {
        elementId,
        documentId,
        pageSize,
        searchQuery,
        isApproved,
        isTranslated,
      } = input;

      if (isApproved !== undefined && isTranslated !== true) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "isTranslated must be true when isApproved is set",
        });
      }

      const target = await prisma.translatableElement.findUnique({
        where: {
          id: elementId,
        },
        select: {
          sortIndex: true,
        },
      });

      if (!target)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Element with given id does not exists",
        });

      const count = await prisma.translatableElement.count({
        where: {
          documentId,
          value:
            searchQuery.trim().length !== 0
              ? { contains: searchQuery, mode: "insensitive" }
              : {},
          sortIndex: {
            lt: target.sortIndex,
          },

          Translations:
            isTranslated === undefined && isApproved === undefined
              ? undefined
              : isTranslated === false && isApproved === undefined
                ? {
                    none: {},
                  }
                : isTranslated === true && isApproved === undefined
                  ? {
                      some: {},
                    }
                  : isTranslated === true && isApproved === false
                    ? {
                        some: {
                          Approvements: {
                            none: {},
                          },
                        },
                      }
                    : isTranslated === true && isApproved === true
                      ? {
                          some: {
                            Approvements: {
                              some: {
                                isActive: true,
                              },
                            },
                          },
                        }
                      : undefined,
        },
      });

      return Math.floor(count / pageSize);
    }),
  delete: authedProcedure
    .input(
      z.object({
        id: z.ulid(),
      }),
    )
    .output(z.void())
    .mutation(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const { id } = input;

      await prisma.document.delete({
        where: {
          id,
        },
      });
    }),
  getDocumentVersions: authedProcedure
    .input(
      z.object({
        documentId: z.ulid(),
      }),
    )
    .output(z.array(DocumentVersionSchema))
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const { documentId } = input;

      return await prisma.documentVersion.findMany({
        where: {
          documentId,
        },
        orderBy: {
          createdAt: "desc",
        },
      });
    }),
  getDocumentContent: authedProcedure
    .input(
      z.object({
        documentId: z.ulid(),
        documentVersionId: z.number().int().optional(),
      }),
    )
    .output(z.string())
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
        pluginRegistry,
      } = ctx;
      const { documentId, documentVersionId } = input;

      const document = await prisma.document.findUnique({
        where: {
          id: documentId,
          Versions: {
            some: {
              id: documentVersionId,
            },
          },
        },
        select: {
          File: true,
          FileHandler: {
            select: {
              serviceId: true,
              PluginInstallation: {
                select: {
                  pluginId: true,
                },
              },
            },
          },
        },
      });

      if (!document)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "指定文档不存在",
        });

      if (!document.File || !document.FileHandler)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "文档不是基于文件的",
        });

      const { service: handler } = (await pluginRegistry.getPluginService(
        prisma,
        document.FileHandler.PluginInstallation.pluginId,
        "TRANSLATABLE_FILE_HANDLER",
        document.FileHandler.serviceId,
      ))!;

      if (!handler) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "文件的文件解析器不存在",
        });
      }

      const { provider } = await useStorage(
        prisma,
        "s3-storage-provider",
        "S3",
        "GLOBAL",
        "",
      );
      const content = await provider.getContent(document.File);

      const elements = await prisma.translatableElement.findMany({
        where: {
          documentId,
          documentVersionId,
        },
      });

      return (
        await handler.getReplacedFileContent(
          document.File,
          content,
          elements.map(({ value, meta }) => ({
            value,
            meta: meta as JSONType,
          })),
        )
      ).toString();
    }),
});
