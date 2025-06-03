import { documentFromFilePretreatmentQueue } from "@/server/processor/documentFromFilePretreatment";
import { useStorage } from "@/server/utils/storage/useStorage";
import { prisma } from "@cat/db";
import {
  DocumentSchema,
  ElementTranslationStatusSchema,
  FileMetaSchema,
  FileSchema,
  PrismaError,
  TaskSchema,
  TranslatableElementSchema,
  TranslationSchema,
} from "@cat/shared";
import { TRPCError } from "@trpc/server";
import { readFileSync } from "fs";
import { join } from "node:path";
import { z } from "zod/v4";
import { safeJoinPath, sanitizeFileName } from "../../utils/file";
import { authedProcedure, router } from "../server";

export const documentRouter = router({
  fileUploadURL: authedProcedure
    .input(
      z.object({
        meta: FileMetaSchema,
      }),
    )
    .output(
      z.object({
        url: z.string().url(),
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
              mimeType: meta.type,
            },
          },
          StorageType: {
            connect: {
              name: getId(),
            },
          },
        },
      });

      return {
        url: await generateUploadURL(path, 120),
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
          },
        });

        const document = await tx.document.create({
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
          },
          include: {
            File: {
              include: {
                Type: true,
              },
            },
            Project: true,
          },
        });

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

      documentFromFilePretreatmentQueue.add(
        taskId,
        {
          taskId: taskId,
          sourceLanguageId: document.Project.sourceLanguageId,
          parsedFile,
          parsedDocument,
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
        id: z.cuid2(),
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
  queryElementTotalAmount: authedProcedure
    .input(z.object({ id: z.string(), searchQuery: z.string().default("") }))
    .query(async ({ input }) => {
      const { id, searchQuery } = input;

      return await prisma.translatableElement.count({
        where: {
          documentId: id,
          value:
            searchQuery.trim().length !== 0
              ? { contains: searchQuery, mode: "insensitive" }
              : undefined,
        },
      });
    }),
  queryFirstUntranslatedElement: authedProcedure
    .input(
      z.object({
        id: z.string(),
        idGreaterThan: z.number().optional(),
      }),
    )
    .query(async ({ input }) => {
      const { id, idGreaterThan } = input;

      const firstTry = await prisma.translatableElement.findFirst({
        where: {
          id: idGreaterThan ? { gt: idGreaterThan } : undefined,
          documentId: id,
          Translations: { none: {} },
        },
        orderBy: { id: "asc" },
      });

      if (!firstTry && idGreaterThan !== undefined) {
        const secondTry = await prisma.translatableElement.findFirst({
          where: {
            documentId: id,
            Translations: { none: {} },
          },
          orderBy: { id: "asc" },
        });
        return TranslatableElementSchema.nullable().parse(secondTry);
      }

      return TranslatableElementSchema.nullable().parse(firstTry);
    }),
  exportFinalFile: authedProcedure
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

      const parsedDocument = DocumentSchema.parse(document);
      const path = safeJoinPath(
        import.meta.env.LOCAL_STORAGE_ROOT_DIR ?? "",
        "uploads",
        document.File.storedPath,
      );
      const fileContent = readFileSync(path, "utf-8");

      const handler = pluginRegistry
        .getTranslatableFileHandlers()
        .find((handler) =>
          handler.canGenerateTranslated(document.File!, fileContent),
        );

      if (!handler)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "没有可以导出这种文件的文件解析器",
        });

      const translations = z.array(TranslationSchema).parse(
        await prisma.translation.findMany({
          where: {
            TranslatableElement: {
              documentId: id,
            },
            languageId,
          },
          include: {
            TranslatableElement: true,
          },
        }),
      );

      try {
        handler.generateTranslated(
          parsedDocument.File!,
          fileContent,
          translations,
        );
      } catch (e) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "生成译文时出错",
          cause: e,
        });
      }
    }),
  countTranslatedElement: authedProcedure
    .input(
      z.object({
        id: z.string(),
        languageId: z.string(),
      }),
    )
    .query(async ({ input }) => {
      const { id, languageId } = input;

      return await prisma.translatableElement
        .count({
          where: {
            documentId: id,
            Translations: {
              some: {
                languageId,
              },
            },
          },
        })
        .catch((e: PrismaError) => {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: e.message,
            cause: e,
          });
        });
    }),
  countTranslatedElementWithApproved: authedProcedure
    .input(
      z.object({
        id: z.string(),
        languageId: z.string(),
        isApproved: z.boolean(),
      }),
    )
    .query(async ({ input }) => {
      const { id, languageId, isApproved } = input;

      return await prisma.translatableElement
        .count({
          where: {
            documentId: id,
            Translations: {
              some: {
                languageId,
                isApproved,
              },
            },
          },
        })
        .catch((e: PrismaError) => {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: e.message,
            cause: e,
          });
        });
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
        },
        include: {
          Translations: {
            where: {
              languageId,
            },
            select: {
              isApproved: true,
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
        (translation) => translation.isApproved,
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
      }),
    )
    .output(z.array(TranslatableElementSchema))
    .query(async ({ input }) => {
      const { documentId, page, pageSize, searchQuery } = input;

      return z.array(TranslatableElementSchema).parse(
        await prisma.translatableElement.findMany({
          where: {
            documentId: documentId,
            value:
              searchQuery?.trim().length !== 0
                ? { contains: searchQuery }
                : undefined,
          },
          orderBy: {
            id: "asc",
          },
          skip: page * pageSize,
          take: pageSize,
        }),
      );
    }),
  queryPageIndexOfElement: authedProcedure
    .input(
      z.object({
        id: z.number(),
        documentId: z.string(),
        pageSize: z.number().int().default(16),
        searchQuery: z.string().default(""),
      }),
    )
    .output(z.number().int())
    .query(async ({ input }) => {
      const { id, documentId, pageSize, searchQuery } = input;

      const count = await prisma.translatableElement.count({
        where: {
          id: {
            lt: id,
          },
          documentId,
          value:
            searchQuery.trim().length !== 0
              ? { contains: searchQuery, mode: "insensitive" }
              : undefined,
        },
      });

      return Math.floor(count / pageSize);
    }),
  delete: authedProcedure
    .input(
      z.object({
        id: z.cuid2(),
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
  countTranslatableElement: authedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .output(z.number())
    .query(async ({ input }) => {
      const { id } = input;

      return await prisma.translatableElement.count({
        where: {
          documentId: id,
        },
      });
    }),
});
