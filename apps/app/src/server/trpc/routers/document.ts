import { join } from "node:path";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
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
import { TaskSchema } from "@cat/shared/schema/prisma/misc";
import type { JSONType } from "@cat/shared/schema/json";
import { authedProcedure, router } from "@/server/trpc/server.ts";
import { exportTranslatedFileQueue } from "@/server/processor/exportTranslatedFile.ts";
import { useStorage } from "@/server/utils/storage/useStorage.ts";
import { documentFromFilePretreatmentQueue } from "@/server/processor/documentFromFilePretreatment.ts";

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
      const { id: providerId, provider } = await useStorage(
        prisma,
        "s3-storage-provider",
        "S3",
        "GLOBAL",
        "",
      );

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

      const { parsedFile, parsedDocument, handlerId, vectorizerId, taskId } =
        await prisma.$transaction(async (tx) => {
          const file = await prisma.file.findUnique({
            where: {
              id: fileId,
            },
          });

          if (!file)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "File does not exists",
            });

          const parsedFile = FileSchema.parse(file);

          const handlerData = (
            await pluginRegistry.getPluginServices(
              prisma,
              "TRANSLATABLE_FILE_HANDLER",
            )
          ).find(({ service }) => service.canExtractElement(parsedFile));

          if (!handlerData) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "没有可以处理这种文件的文件解析器",
            });
          }

          const project = await tx.project.findUnique({
            where: {
              id: projectId,
            },
          });

          if (!project)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Project with given id does not exists",
            });

          const vectorizerData = (
            await pluginRegistry.getPluginServices(prisma, "TEXT_VECTORIZER")
          ).find(({ service }) =>
            service.canVectorize(project.sourceLanguageId),
          );

          if (!vectorizerData) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "CAT 没有可以处理这种文本的向量化器",
            });
          }

          const task = await tx.task.create({
            data: {
              type: "document_from_file_pretreatment",
              meta: {
                projectId,
              },
            },
          });

          // 在这里开始选择创建或查找现存文档
          // 并维护文档版本
          let document =
            (await tx.document.findFirst({
              where: {
                projectId: project.id,
                File: {
                  originName: file.originName,
                },
              },
              include: {
                Tasks: {
                  where: {
                    type: "document_from_file_pretreatment",
                  },
                  take: 1,
                },
                Versions: true,
                Project: true,
              },
            })) ?? null;

          if (!document) {
            document = await tx.document.create({
              data: {
                Creator: {
                  connect: {
                    id: user.id,
                  },
                },
                File: {
                  connect: {
                    id: fileId,
                  },
                },
                Project: {
                  connect: {
                    id: projectId,
                  },
                },
                Tasks: {
                  connect: {
                    id: task.id,
                  },
                },
                Versions: {
                  create: {
                    isActive: true,
                  },
                },
              },
              include: {
                File: true,
                Tasks: {
                  where: {
                    type: "document_from_file_pretreatment",
                  },
                  take: 1,
                },
                Versions: true,
                Project: true,
              },
            });
          } else {
            await tx.document.update({
              where: {
                id: document.id,
              },
              data: {
                Tasks: {
                  disconnect: document.Tasks[0]
                    ? {
                        id: document.Tasks[0].id,
                      }
                    : undefined,
                  connect: {
                    id: task.id,
                  },
                },
                Versions: {
                  updateMany: {
                    where: {
                      isActive: true,
                    },
                    data: {
                      isActive: false,
                    },
                  },
                  create: {
                    isActive: true,
                  },
                },
              },
            });
          }

          const parsedDocument = DocumentSchema.parse(document);

          return {
            parsedFile,
            parsedDocument,
            handlerId: handlerData.id,
            vectorizerId: vectorizerData.id,
            taskId: task.id,
          };
        });

      await documentFromFilePretreatmentQueue.add(
        taskId,
        {
          sourceLanguageId: parsedDocument.Project!.sourceLanguageId,
          file: parsedFile,
          document: parsedDocument,
          handlerId,
          vectorizerId,
        },
        {
          jobId: taskId,
        },
      );

      return parsedDocument;
    }),
  queryTask: authedProcedure
    .input(
      z.object({
        id: z.ulid(),
        type: z.string(),
      }),
    )
    .output(TaskSchema.nullable())
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const { id, type } = input;

      const task = await prisma.document.findUnique({
        where: {
          id,
        },
        select: {
          Tasks: {
            where: {
              type,
            },
          },
        },
      });

      if (!task || task.Tasks.length === 0) return null;

      return TaskSchema.nullable().parse(task.Tasks[0]);
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

      return DocumentSchema.nullable().parse(document);
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
          isActive: true,

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
          isActive: true,

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

      return TranslatableElementSchema.nullable().parse(element);
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

      const { provider } = await useStorage(
        prisma,
        "s3-storage-provider",
        "S3",
        "GLOBAL",
        "",
      );
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
          isActive: true,
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
          isActive: true,

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

      return z.array(TranslatableElementSchema).parse(result);
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
          isActive: true,

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

      return z.array(DocumentVersionSchema).parse(
        await prisma.documentVersion.findMany({
          where: {
            documentId,
          },
          orderBy: {
            createdAt: "desc",
          },
        }),
      );
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

      if (!document || !document.File || !document.FileHandler)
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
          isActive: !documentVersionId ? true : undefined,
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
