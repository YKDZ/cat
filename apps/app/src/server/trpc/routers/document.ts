import { documentFromFilePretreatmentQueue } from "@/server/processor/documentFromFilePretreatment";
import { useStorage } from "@/server/utils/storage/useStorage";
import { prisma } from "@cat/db";
import type { PrismaError } from "@cat/shared";
import {
  DocumentSchema,
  ElementTranslationStatusSchema,
  FileMetaSchema,
  FileSchema,
  TaskSchema,
  TranslatableElementSchema,
} from "@cat/shared";
import { TRPCError } from "@trpc/server";
import { join } from "node:path";
import { z } from "zod/v4";
import { sanitizeFileName } from "../../utils/file";
import { authedProcedure, router } from "../server";
import { exportTranslatedFileQueue } from "@/server/processor/exportTranslatedFile";

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
    .mutation(async ({ input }) => {
      const { meta } = input;
      const {
        storage: { getId, getBasicPath, generateUploadURL },
      } = await useStorage();

      const name = sanitizeFileName(meta.name);

      const path = join(getBasicPath(), "documents", name);

      // TODO 校验文件类型
      const file = await prisma.file.create({
        data: {
          originName: meta.name,
          storedPath: path,
          Type: {
            connect: {
              mimeType: meta.mimeType,
            },
          },
          StorageType: {
            connect: {
              name: getId(),
            },
          },
        },
      });

      const url = await generateUploadURL(path, 120);

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
      const { user, pluginRegistry } = ctx;

      const {
        parsedFile,
        document,
        parsedDocument,
        handler,
        vectorizer,
        taskId,
      } = await prisma.$transaction(async (tx) => {
        const file = await prisma.file.findUnique({
          where: {
            id: fileId,
          },
          include: {
            Type: true,
          },
        });

        if (!file)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "File does not exists",
          });

        const parsedFile = FileSchema.parse(file);

        const handler = pluginRegistry
          .getTranslatableFileHandlers()
          .find((handler) => handler.canExtractElement(parsedFile));

        if (!handler) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "CAT 没有可以处理这种文件的文件解析器",
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

        const vectorizer = pluginRegistry
          .getTextVectorizers()
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
              File: {
                include: {
                  Type: true,
                },
              },
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
              File: {
                include: {
                  Type: true,
                },
              },
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
                disconnect: {
                  id: document.Tasks[0].id,
                },
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
          document,
          parsedDocument,
          handler,
          vectorizer,
          taskId: task.id,
        };
      });

      await documentFromFilePretreatmentQueue.add(
        taskId,
        {
          taskId: taskId,
          sourceLanguageId: document.Project.sourceLanguageId,
          file: parsedFile,
          document: parsedDocument,
          handlerId: handler.getId(),
          vectorizerId: vectorizer.getId(),
        },
        {
          attempts: 3,
          removeOnComplete: {
            age: 60 * 60,
            count: 1000,
          },
          removeOnFail: {
            age: 24 * 60 * 60,
          },
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
    .query(async ({ input }) => {
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
    .query(async ({ input }) => {
      const { id } = input;

      const document = await prisma.document
        .findUnique({
          where: {
            id,
          },
          include: {
            File: {
              include: {
                Type: true,
              },
            },
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
    .query(async ({ input }) => {
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
                          Approvments: {
                            none: {},
                          },
                        },
                      }
                    : isTranslated === true && isApproved === true
                      ? {
                          some: {
                            Approvments: {
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
        isApproved: z.boolean().optional(),
        isTranslated: z.boolean().optional(),
      }),
    )
    .query(async ({ input }) => {
      const { documentId, searchQuery, isApproved, isTranslated } = input;

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
                          Approvments: {
                            none: {},
                          },
                        },
                      }
                    : isTranslated === true && isApproved === true
                      ? {
                          some: {
                            Approvments: {
                              some: {
                                isActive: true,
                              },
                            },
                          },
                        }
                      : undefined,
        },
        orderBy: { value: "asc" },
      });

      return TranslatableElementSchema.nullable().parse(element);
    }),
  exportTranslatedFile: authedProcedure
    .input(
      z.object({
        id: z.string(),
        languageId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { pluginRegistry } = ctx;
      const { id, languageId } = input;

      const document = await prisma.document.findFirst({
        where: {
          id,
        },
        include: {
          File: {
            include: {
              Type: true,
            },
          },
        },
      });

      if (!document)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "指定文档不存在",
        });

      if (!document.File)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "指定文档不是基于文件的",
        });

      const handler = pluginRegistry
        .getTranslatableFileHandlers()
        .find((handler) => handler.canGenerateTranslated(document.File!));

      if (!handler)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "没有可以导出这种文件的文件解析器",
        });

      const task = await prisma.task.create({
        data: {
          type: "export_translated_file",
          meta: {
            projectId: document.projectId,
            documentId: document.id,
            languageId,
          },
        },
      });

      await exportTranslatedFileQueue.add(task.id, {
        taskId: task.id,
        handlerId: handler.getId(),
        documentId: document.id,
        languageId,
      });
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
    .query(async ({ input }) => {
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

      const storage = (await useStorage()).storage;
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
          Type: {
            select: {
              mimeType: true,
            },
          },
        },
      });

      if (!file)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "File does not exists",
        });

      const url = await storage.generateDownloadURL(
        file.storedPath,
        file.originName,
        file.Type.mimeType,
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
    .query(async ({ input }) => {
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
              Approvments: {
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
        (translation) => translation.Approvments.length > 0,
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
    .query(async ({ input }) => {
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
                          Approvments: {
                            none: {},
                          },
                        },
                      }
                    : isTranslated === true && isApproved === true
                      ? {
                          some: {
                            Approvments: {
                              some: {
                                isActive: true,
                              },
                            },
                          },
                        }
                      : undefined,
        },
        orderBy: { value: "asc" },
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
    .query(async ({ input }) => {
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
      });

      if (!target)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Element with given id does not exists",
        });

      const count = await prisma.translatableElement.count({
        where: {
          documentId,
          value: {
            lt: target.value,
            ...(searchQuery.trim().length !== 0
              ? { contains: searchQuery, mode: "insensitive" }
              : {}),
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
                          Approvments: {
                            none: {},
                          },
                        },
                      }
                    : isTranslated === true && isApproved === true
                      ? {
                          some: {
                            Approvments: {
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
    .mutation(async ({ input }) => {
      const { id } = input;

      await prisma.document.delete({
        where: {
          id,
        },
      });
    }),
});
