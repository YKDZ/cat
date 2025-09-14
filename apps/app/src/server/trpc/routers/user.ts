import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { UserSchema } from "@cat/shared/schema/prisma/user";
import { FileMetaSchema } from "@cat/shared/schema/misc";
import { authedProcedure, router } from "../server.ts";
import { useStorage } from "@/server/utils/storage/useStorage.ts";

export const userRouter = router({
  query: authedProcedure
    .input(
      z.object({
        id: z.ulid(),
      }),
    )
    .output(UserSchema.nullable())
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
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
    .output(UserSchema)
    .mutation(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
        user,
      } = ctx;
      const { user: newUser } = input;

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
      const {
        prismaDB: { client: prisma },
        user,
      } = ctx;
      const { meta } = input;

      const { id: storageProviderId, provider } = await useStorage(
        prisma,
        "S3",
        "GLOBAL",
        "",
      );

      const sanitizedName = meta.name.replace(/[^\w.-]/g, "_");
      const name = `${randomUUID()}-${sanitizedName}`;
      const path = join(provider.getBasicPath(), "avatars", name);
      const url = await provider.generateUploadURL(path, 120);

      await prisma.user.update({
        where: {
          id: user.id,
        },
        data: {
          AvatarFile: {
            create: {
              originName: meta.name,
              storedPath: path,
              storageProviderId,
            },
          },
        },
      });

      return url;
    }),
  queryAvatar: authedProcedure
    .input(
      z.object({
        id: z.ulid(),
      }),
    )
    .output(
      z.object({
        url: z.string().nullable(),
        expiresIn: z.number().int(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const { id } = input;

      const user = await prisma.user.findUnique({
        where: {
          id,
        },
        select: {
          AvatarFile: {
            select: {
              storedPath: true,
              StorageProvider: {
                select: {
                  id: true,
                  serviceId: true,
                },
              },
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

      const { provider } = await useStorage(
        prisma,
        user.AvatarFile.StorageProvider.serviceId,
        "GLOBAL",
        "",
      );
      const url = await provider.generateURL(
        user.AvatarFile.storedPath,
        expiresIn,
      );

      return {
        url,
        expiresIn,
      };
    }),
});
