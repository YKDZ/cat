import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
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
import { StorageProvider } from "@cat/plugin-core";
import { authed, base } from "@/orpc/server";
import { ORPCError } from "@orpc/client";

export const get = base
  .input(
    z.object({
      userId: z.uuidv4(),
    }),
  )
  .output(UserSchema.nullable())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { userId } = input;

    return assertSingleOrNull(
      await drizzle.select().from(userTable).where(eq(userTable.id, userId)),
    );
  });

export const update = authed
  .input(
    z.object({
      user: UserSchema,
    }),
  )
  .output(UserSchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;
    const { user: newUser } = input;

    if (user.id !== newUser.id) throw new ORPCError("UNAUTHORIZED");

    return assertSingleNonNullish(
      await drizzle
        .update(userTable)
        .set({
          name: newUser.name,
        })
        .where(eq(userTable.id, newUser.id))
        .returning(),
    );
  });

export const prepareUploadAvatar = authed
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
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      redisDB: { redis },
      user,
    } = context;
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
  });

export const finishUploadAvatar = authed
  .input(
    z.object({
      putSessionId: z.uuidv4(),
    }),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      redisDB: { redis },
      pluginRegistry,
      user,
    } = context;
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
  });

export const getAvatarPresignedUrl = authed
  .input(
    z.object({
      userId: z.uuidv4(),
      expiresIn: z.int().max(120).default(120),
    }),
  )
  .output(z.url().nullable())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      pluginRegistry,
    } = context;
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
  });
