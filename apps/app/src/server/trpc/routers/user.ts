import { FileMetaSchema, UserSchema } from "@cat/shared";
import { authedProcedure, router } from "../server";
import { z } from "zod/v4";
import { prisma } from "@cat/db";
import { TRPCError } from "@trpc/server";
import { useStorage } from "@/server/utils/storage/useStorage";
import { randomUUID } from "crypto";
import { join } from "path";

export const userRouter = router({
  query: authedProcedure
    .input(
      z.object({
        id: z.cuid2(),
      }),
    )
    .query(async ({ input }) => {
      const { id } = input;

      return UserSchema.nullable().parse(
        await prisma.user.findUnique({
          where: {
            id,
          },
        }),
      );
    }),
  update: authedProcedure
    .input(
      z.object({
        user: UserSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { user: newUser } = input;
      const { user } = ctx;

      if (user.id !== newUser.id)
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "你没有更新他人的信息的权限",
        });

      return UserSchema.parse(
        await prisma.user.update({
          where: {
            id: newUser.id,
          },
          data: {
            name: user.name,
          },
        }),
      );
    }),
  uploadAvatar: authedProcedure
    .input(
      z.object({
        meta: FileMetaSchema,
      }),
    )
    .output(z.url())
    .mutation(async ({ ctx, input }) => {
      const { user } = ctx;
      const { meta } = input;

      const {
        storage: { getId, getBasicPath, generateUploadURL },
      } = await useStorage();

      const sanitizedName = meta.name.replace(/[^\w.-]/g, "_");
      const name = `${randomUUID()}-${sanitizedName}`;
      const path = join(getBasicPath(), "avatars", name);
      const url = await generateUploadURL(path, 120);

      await prisma.user.update({
        where: {
          id: user.id,
        },
        data: {
          AvatarFile: {
            create: {
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
          },
        },
      });

      return url;
    }),
  queryAvatar: authedProcedure
    .input(
      z.object({
        id: z.cuid2(),
      }),
    )
    .output(
      z.object({
        url: z.string().nullable(),
        expiresIn: z.number().int(),
      }),
    )
    .query(async ({ input }) => {
      const { id } = input;

      const user = await prisma.user.findUnique({
        where: {
          id,
        },
        select: {
          AvatarFile: {
            include: {
              Type: true,
            },
          },
        },
      });

      if (!user)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "User do not exists",
        });
      if (!user.AvatarFile)
        return {
          url: null,
          expiresIn: 0,
        };

      const expiresIn = 120;

      const {
        storage: { generateURL },
      } = await useStorage();
      const url = await generateURL(user.AvatarFile.storedPath, expiresIn);

      return {
        url,
        expiresIn,
      };
    }),
});
