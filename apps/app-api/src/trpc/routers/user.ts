import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { TRPCError } from "@trpc/server";
import * as z from "zod/v4";
import { UserSchema } from "@cat/shared/schema/drizzle/user";
import { FileMetaSchema } from "@cat/shared/schema/misc";
import { useStorage } from "@cat/app-server-shared/utils";
import { eq, file as fileTable, user as userTable } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";
import { authedProcedure, router } from "@/trpc/server.ts";

export const userRouter = router({
  query: authedProcedure
    .input(
      z.object({
        id: z.uuidv7(),
      }),
    )
    .output(UserSchema.nullable())
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { id } = input;

      return (
        (await drizzle.query.user.findFirst({
          where: (user, { eq }) => eq(user.id, id),
        })) ?? null
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
        drizzleDB: { client: drizzle },
        user,
      } = ctx;
      const { user: newUser } = input;

      if (user.id !== newUser.id)
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "你没有更新他人的信息的权限",
        });

      return assertSingleNonNullish(
        await drizzle
          .update(userTable)
          .set({
            name: newUser.name,
          })
          .where(eq(userTable.id, newUser.id))
          .returning(),
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
        drizzleDB: { client: drizzle },
        user,
      } = ctx;
      const { meta } = input;

      const { id: storageProviderId, provider } = await useStorage(
        drizzle,
        "s3-storage-provider",
        "S3",
        "GLOBAL",
        "",
      );

      const sanitizedName = meta.name.replace(/[^\w.-]/g, "_");
      const name = `${randomUUID()}-${sanitizedName}`;
      const path = join(provider.getBasicPath(), "avatars", name);
      const url = await provider.generateUploadURL(path, 120);

      await drizzle.insert(fileTable).values([
        {
          originName: meta.name,
          storageProviderId,
          userId: user.id,
          storedPath: path,
        },
      ]);

      return url;
    }),
  queryAvatar: authedProcedure
    .input(
      z.object({
        id: z.uuidv7(),
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
        drizzleDB: { client: drizzle },
      } = ctx;
      const { id } = input;

      const user = await drizzle.query.user.findFirst({
        where: (user, { eq }) => eq(user.id, id),
        with: {
          AvatarFile: {
            columns: {
              storedPath: true,
            },
            with: {
              StorageProvider: {
                columns: {
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
        drizzle,
        "s3-storage-provider",
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
