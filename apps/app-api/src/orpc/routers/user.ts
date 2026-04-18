import {
  executeCommand,
  executeQuery,
  getUser,
  getUserAvatarFile,
  updateUser,
  updateUserAvatar,
} from "@cat/domain";
import { StorageProvider } from "@cat/plugin-core";
import {
  finishPresignedPutFile,
  firstOrGivenService,
  getDownloadUrl,
  getServiceFromDBId,
  preparePresignedPutFile,
} from "@cat/server-shared";
import { UserSchema } from "@cat/shared/schema/drizzle/user";
import { FileMetaSchema } from "@cat/shared/schema/misc";
import { ORPCError } from "@orpc/client";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import * as z from "zod";

import { authed } from "@/orpc/server";

export const get = authed
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

    return await executeQuery({ db: drizzle }, getUser, input);
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

    return await executeCommand({ db: drizzle }, updateUser, {
      userId: newUser.id,
      name: newUser.name,
    });
  });

export const prepareUploadAvatar = authed
  .input(
    z.object({
      meta: FileMetaSchema,
    }),
  )
  .output(
    z.object({
      url: z.string(),
      putSessionId: z.uuidv4(),
    }),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      sessionStore,
      user,
      pluginManager,
    } = context;
    const { meta } = input;

    // TODO 储存的配置
    const storage = firstOrGivenService(pluginManager, "STORAGE_PROVIDER");

    if (!storage) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "No storage provider available",
      });
    }

    const sanitizedName = meta.name.replace(/[^\w.-]/g, "_");
    const name = `${randomUUID()}-${sanitizedName}`;
    const key = join("avatars", name);
    const ctxHash = createHash("sha256").update(user.id).digest("hex");

    const { url, putSessionId } = await preparePresignedPutFile(
      drizzle,
      sessionStore,
      storage.service,
      storage.id,
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
      sessionStore,
      pluginManager,
      user,
    } = context;
    const { putSessionId } = input;

    const ctxHash = createHash("sha256").update(user.id).digest("hex");

    const fileId = await finishPresignedPutFile(
      drizzle,
      sessionStore,
      pluginManager,
      putSessionId,
      ctxHash,
    );

    await executeCommand({ db: drizzle }, updateUserAvatar, {
      userId: user.id,
      fileId,
    });
  });

export const getAvatarPresignedUrl = authed
  .input(
    z.object({
      userId: z.uuidv4(),
      expiresIn: z.int().max(120).default(120),
    }),
  )
  .output(z.string().nullable())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      sessionStore,
      pluginManager,
    } = context;
    const { userId, expiresIn } = input;

    const avatarFile = await executeQuery({ db: drizzle }, getUserAvatarFile, {
      userId,
    });

    if (!avatarFile) return null;

    const { key, storageProviderId } = avatarFile;

    const provider = getServiceFromDBId<StorageProvider>(
      pluginManager,
      storageProviderId,
    );

    return await getDownloadUrl(
      sessionStore,
      provider,
      storageProviderId,
      key,
      expiresIn,
    );
  });
