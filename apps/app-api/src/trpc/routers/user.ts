import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { TRPCError } from "@trpc/server";
import * as z from "zod/v4";
import { UserSchema } from "@cat/shared/schema/drizzle/user";
import { FileMetaSchema } from "@cat/shared/schema/misc";
import {
  finishPresignedPutFile,
  getServiceFromDBId,
  preparePresignedPutFile,
  useStorage,
} from "@cat/app-server-shared/utils";
import {
  eq,
  file as fileTable,
  user as userTable,
  blob as blobTable,
  and,
} from "@cat/db";
import { assertSingleNonNullish, assertSingleOrNull } from "@cat/shared/utils";
import { permissionProcedure, router } from "@/trpc/server.ts";
import { StorageProvider } from "@cat/plugin-core";

export const userRouter = router({
  get: permissionProcedure("USER", "get.others")
    .input(
      z.object({
        userId: z.uuidv4(),
      }),
    )
    .output(UserSchema.nullable())
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { userId } = input;

      return assertSingleOrNull(
        await drizzle.select().from(userTable).where(eq(userTable.id, userId)),
      );
    }),
  update: permissionProcedure("USER", "update.self")
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
          message:
            "This endpoint should only be used to update the authenticated user's own information",
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
  prepareUploadAvatar: permissionProcedure("USER", "avatar.create.self")
    .input(
      z.object({
        meta: FileMetaSchema,
      }),
    )
    .output(
      z.object({
        url: z.url(),
        putSessionId: z.uuidv4(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
        redisDB: { redis },
        user,
      } = ctx;
      const { meta } = input;

      // TODO 储存的配置
      const { id: storageProviderId, provider } = await useStorage(
        drizzle,
        "s3-storage-provider",
        "S3",
        "GLOBAL",
        "",
      );

      const sanitizedName = meta.name.replace(/[^\w.-]/g, "_");
      const name = `${randomUUID()}-${sanitizedName}`;
      const key = join("avatars", name);
      const ctxHash = createHash("sha256").update(user.id).digest("hex");

      const { url, putSessionId } = await preparePresignedPutFile(
        drizzle,
        redis,
        provider,
        storageProviderId,
        key,
        name,
        ctxHash,
      );

      return { url, putSessionId };
    }),
  finishUploadAvatar: permissionProcedure("USER", "avatar.create.self")
    .input(
      z.object({
        putSessionId: z.uuidv4(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
        redisDB: { redis },
        pluginRegistry,
        user,
      } = ctx;
      const { putSessionId } = input;

      const ctxHash = createHash("sha256").update(user.id).digest("hex");

      const fileId = await finishPresignedPutFile(
        drizzle,
        redis,
        pluginRegistry,
        putSessionId,
        ctxHash,
      );

      await drizzle
        .update(userTable)
        .set({
          avatarFileId: fileId,
        })
        .where(eq(userTable.id, user.id));
    }),
  getAvatarPresignedUrl: permissionProcedure(
    "USER",
    "avatar.get.others",
    z.object({
      userId: z.uuidv4(),
    }),
  )
    .input(
      z.object({
        expiresIn: z.int().max(120).default(120),
      }),
    )
    .output(z.url().nullable())
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
        pluginRegistry,
      } = ctx;
      const { userId, expiresIn } = input;

      const rows = await drizzle
        .select({
          key: blobTable.key,
          storageProviderId: blobTable.storageProviderId,
        })
        .from(userTable)
        .innerJoin(
          fileTable,
          and(
            eq(userTable.avatarFileId, fileTable.id),
            eq(fileTable.isActive, true),
          ),
        )
        .innerJoin(blobTable, eq(fileTable.blobId, blobTable.id))
        .where(eq(userTable.id, userId));

      if (rows.length === 0) return null;

      const { key, storageProviderId } = assertSingleNonNullish(rows);

      const provider = await getServiceFromDBId<StorageProvider>(
        drizzle,
        pluginRegistry,
        storageProviderId,
      );

      return await provider.getPresignedGetUrl(key, expiresIn);
    }),
});
