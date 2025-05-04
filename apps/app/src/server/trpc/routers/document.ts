import { PutObjectCommand, PutObjectCommandInput } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { TRPCError } from "@trpc/server";
import { readFileSync } from "fs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authedProcedure, router } from "../server";
import {
  DocumentSchema,
  ElementTranslationStatusSchema,
  FileMetaSchema,
  FileSchema,
  PrismaError,
  TranslatableElementSchema,
  TranslationSchema,
  UnvectorizedElementDataSchema,
} from "@cat/shared";
import { prisma } from "@cat/db";
import { base64ToBlob, safeJoinPath, saveBlobToFs } from "../../utils/file";
import { redis } from "../../database/redis";
import { s3 } from "../../database/s3";
import {
  TextVectorizerRegistry,
  TranslatableFileHandlerRegistry,
} from "@cat/plugin-core";

export const documentRouter = router({
  initS3Upload: authedProcedure
    .input(FileMetaSchema)
    .query(async ({ input }) => {
      const file = input;
      try {
        const sanitizedName = file.name.replace(/[^\w.-]/g, "_");
        const key = `uploads/${randomUUID()}-${sanitizedName}`;

        const params: PutObjectCommandInput = {
          Bucket: import.meta.env.S3_UPLOAD_BUCKET_NAME,
          Key: key,
        } as PutObjectCommandInput;

        const command = new PutObjectCommand(params);
        const presignedUrl = await getSignedUrl(s3, command, {
          expiresIn: 180,
        });

        const uploadSessionKey = `upload:session:${key}`;
        await redis.set(uploadSessionKey, "pending");

        return {
          originalName: file.name,
          sanitizedName,
          presignedUrl,
        };
      } catch (e) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          cause: e,
          message: "生成预签名链接失败",
        });
      }
    }),
  create: authedProcedure
    .input(
      z.object({
        projectId: z.string(),
        base64File: z.string(),
        name: z.string(),
        type: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { projectId, base64File, name, type } = input;
      const { user } = ctx;

      await prisma.$transaction(async (tx) => {
        const blob = base64ToBlob(base64File, type);

        const storedName = `${randomUUID()}-${name}`;
        const path = safeJoinPath(
          import.meta.env.LOCAL_STORAGE_ROOT_DIR ?? "",
          "uploads",
          storedName,
        );
        await saveBlobToFs(blob, path);

        const file = await tx.file.create({
          data: {
            originName: name,
            storedName,
          },
        });

        const parsedFile = FileSchema.parse(
          await tx.file.create({
            data: {
              originName: name,
              storedName,
            },
          }),
        );

        const documentType = TranslatableFileHandlerRegistry.getInstance()
          .getHandlers()
          .map((handler) => handler.detectDocumentTypeFromFile(parsedFile))
          .filter((name) => typeof name === "string")
          .at(0);

        if (!documentType)
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "CAT 不支持处理这种文档",
          });

        const document = await tx.document.create({
          data: {
            Creator: {
              connect: {
                id: user.id,
              },
            },
            Type: {
              connect: {
                name: documentType,
              },
            },
            File: {
              connect: {
                id: file.id,
              },
            },
            Project: {
              connect: {
                id: projectId,
              },
            },
          },
          include: {
            Type: true,
            File: true,
            Project: true,
          },
        });

        const parsedDocument = DocumentSchema.parse(document);
        const fileContent = readFileSync(path, "utf-8");

        const handler = TranslatableFileHandlerRegistry.getInstance()
          .getHandlers()
          .find((handler) =>
            handler.canExtractElementFromFile(parsedDocument, fileContent),
          );

        if (!handler) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "CAT 没有可以处理这种文件的文件解析器",
          });
        }

        const elements = handler
          .extractElementFromFile(parsedDocument, fileContent)
          .map((element) => {
            return {
              value: element.value,
              documentId: document.id,
              meta: element.meta,
            };
          });

        const vectorizer = TextVectorizerRegistry.getInstance()
          .getVectorizers()
          .find((vectorizer) =>
            vectorizer.canVectorize(document.Project.sourceLanguageId),
          );

        if (!vectorizer) return;

        const vectors =
          (await vectorizer.vectorize(
            document.Project.sourceLanguageId,
            z.array(UnvectorizedElementDataSchema).parse(elements),
          )) ?? [];

        if (!vectors) return;

        await Promise.all(
          elements.map(async (element, index) => {
            const embedding = `[${vectors[index].join(",")}]`;
            return await tx.$executeRawUnsafe(`
              INSERT INTO "TranslatableElement" (value, embedding, meta, "documentId")
              VALUES ('${element.value}', '${embedding}', '${element.meta}', '${element.documentId}')
            `);
          }),
        );
      });
    }),
  query: authedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const { id } = input;

      const document = await prisma.document
        .findUniqueOrThrow({
          where: {
            id,
          },
          include: {
            Type: true,
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

      return DocumentSchema.parse(document);
    }),
  queryElementTotalAmount: authedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const { id } = input;

      return await prisma.translatableElement.count({
        where: {
          documentId: id,
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
  exportFinal: authedProcedure
    .input(
      z.object({
        id: z.string(),
        languageId: z.string(),
      }),
    )
    .query(async ({ input }) => {
      const { id, languageId } = input;

      const document = await prisma.document.findFirst({
        where: {
          id,
        },
        include: {
          File: true,
          Type: true,
        },
      });

      if (!document)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "指定文档不存在",
        });

      const parsedDocument = DocumentSchema.parse(document);
      const path = safeJoinPath(
        import.meta.env.LOCAL_STORAGE_ROOT_DIR ?? "",
        "uploads",
        document.File.storedName,
      );
      const fileContent = readFileSync(path, "utf-8");

      const handler = TranslatableFileHandlerRegistry.getInstance()
        .getHandlers()
        .find((handler) =>
          handler.canGenerateTranslatedFile(parsedDocument, fileContent),
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
        const result = handler.generateTranslatedFile(
          parsedDocument,
          fileContent,
          translations,
        );
        console.log(result);
      } catch (e) {
        console.error(e);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "生成译文时出错",
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
  countTranslatedElementWithApprove: authedProcedure
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
        searchQuery: z.string().optional(),
      }),
    )
    .output(z.array(TranslatableElementSchema))
    .query(async ({ input }) => {
      const { documentId, page, pageSize, searchQuery } = input;

      return z.array(TranslatableElementSchema).parse(
        await prisma.translatableElement.findMany({
          where: {
            documentId: documentId,
            value: searchQuery
              ? { contains: searchQuery, mode: "insensitive" }
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
      }),
    )
    .output(z.number().int())
    .query(async ({ input }) => {
      const { id, documentId, pageSize } = input;

      const count = await prisma.translatableElement.count({
        where: {
          id: {
            lt: id,
          },
          documentId,
        },
      });

      return Math.floor(count / pageSize);
    }),
});
