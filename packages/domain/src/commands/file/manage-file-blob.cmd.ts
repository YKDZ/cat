import {
  and,
  blob as blobTable,
  decrement,
  eq,
  file as fileTable,
  gt,
  increment,
} from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod";

import type { Command } from "@/types";

export const CreateOrReferenceBlobAndFileCommandSchema = z.object({
  key: z.string(),
  storageProviderId: z.int(),
  name: z.string(),
  hash: z.instanceof(Buffer),
});

export type CreateOrReferenceBlobAndFileCommand = z.infer<
  typeof CreateOrReferenceBlobAndFileCommandSchema
>;

export type CreateOrReferenceBlobAndFileResult = {
  blobId: number;
  fileId: number;
  referenceCount: number;
};

export const createOrReferenceBlobAndFile: Command<
  CreateOrReferenceBlobAndFileCommand,
  CreateOrReferenceBlobAndFileResult
> = async (ctx, command) => {
  const blob = assertSingleNonNullish(
    await ctx.db
      .insert(blobTable)
      .values({
        key: command.key,
        storageProviderId: command.storageProviderId,
        hash: command.hash,
      })
      .onConflictDoUpdate({
        target: [blobTable.hash],
        set: {
          referenceCount: increment(blobTable.referenceCount),
        },
      })
      .returning({
        id: blobTable.id,
        referenceCount: blobTable.referenceCount,
      }),
  );

  const file = assertSingleNonNullish(
    await ctx.db
      .insert(fileTable)
      .values({
        name: command.name,
        blobId: blob.id,
        isActive: false,
      })
      .returning({ id: fileTable.id }),
  );

  return {
    result: {
      blobId: blob.id,
      fileId: file.id,
      referenceCount: blob.referenceCount,
    },
    events: [],
  };
};

export const CreateBlobAndFileCommandSchema = z.object({
  key: z.string(),
  storageProviderId: z.int(),
  name: z.string(),
});

export type CreateBlobAndFileCommand = z.infer<
  typeof CreateBlobAndFileCommandSchema
>;

export const CreateBlobAndFileResultSchema = z.object({
  blobId: z.number(),
  fileId: z.number(),
});

export type CreateBlobAndFileResult = z.infer<
  typeof CreateBlobAndFileResultSchema
>;

export const createBlobAndFile: Command<
  CreateBlobAndFileCommand,
  CreateBlobAndFileResult
> = async (ctx, command) => {
  const blob = assertSingleNonNullish(
    await ctx.db
      .insert(blobTable)
      .values({
        key: command.key,
        storageProviderId: command.storageProviderId,
      })
      .returning({ id: blobTable.id }),
  );

  const file = assertSingleNonNullish(
    await ctx.db
      .insert(fileTable)
      .values({
        name: command.name,
        blobId: blob.id,
        isActive: false,
      })
      .returning({ id: fileTable.id }),
  );

  return {
    result: {
      blobId: blob.id,
      fileId: file.id,
    },
    events: [],
  };
};

export const ActivateFileCommandSchema = z.object({
  fileId: z.int(),
});

export type ActivateFileCommand = z.infer<typeof ActivateFileCommandSchema>;

export const activateFile: Command<ActivateFileCommand> = async (
  ctx,
  command,
) => {
  await ctx.db
    .update(fileTable)
    .set({ isActive: true })
    .where(eq(fileTable.id, command.fileId));

  return {
    result: undefined,
    events: [],
  };
};

export const RollbackBlobAndFileCommandSchema = z.object({
  blobId: z.int(),
  fileId: z.int(),
});

export type RollbackBlobAndFileCommand = z.infer<
  typeof RollbackBlobAndFileCommandSchema
>;

export const rollbackBlobAndFile: Command<RollbackBlobAndFileCommand> = async (
  ctx,
  command,
) => {
  await ctx.db
    .update(blobTable)
    .set({ referenceCount: decrement(blobTable.referenceCount) })
    .where(
      and(eq(blobTable.id, command.blobId), gt(blobTable.referenceCount, 0)),
    );

  await ctx.db.delete(fileTable).where(eq(fileTable.id, command.fileId));

  return {
    result: undefined,
    events: [],
  };
};

export const DeleteBlobAndFileCommandSchema = z.object({
  blobId: z.int(),
  fileId: z.int(),
});

export type DeleteBlobAndFileCommand = z.infer<
  typeof DeleteBlobAndFileCommandSchema
>;

export const deleteBlobAndFile: Command<DeleteBlobAndFileCommand> = async (
  ctx,
  command,
) => {
  await ctx.db.delete(blobTable).where(eq(blobTable.id, command.blobId));
  await ctx.db.delete(fileTable).where(eq(fileTable.id, command.fileId));

  return {
    result: undefined,
    events: [],
  };
};

export const FinalizePresignedFileCommandSchema = z.object({
  blobId: z.int(),
  fileId: z.int(),
  hash: z.instanceof(Buffer),
});

export type FinalizePresignedFileCommand = z.infer<
  typeof FinalizePresignedFileCommandSchema
>;

export type FinalizePresignedFileResult = {
  conflicted: boolean;
};

export const finalizePresignedFile: Command<
  FinalizePresignedFileCommand,
  FinalizePresignedFileResult
> = async (ctx, command) => {
  const conflictBlobRows = await ctx.db
    .select({ conflictBlobId: blobTable.id })
    .from(blobTable)
    .where(eq(blobTable.hash, command.hash));

  if (conflictBlobRows.length > 0) {
    const conflictBlobId = conflictBlobRows[0]?.conflictBlobId;
    if (conflictBlobId !== undefined) {
      await ctx.db
        .update(fileTable)
        .set({ blobId: conflictBlobId })
        .where(eq(fileTable.id, command.fileId));

      await ctx.db
        .update(blobTable)
        .set({ referenceCount: increment(blobTable.referenceCount) })
        .where(eq(blobTable.id, conflictBlobId));

      await ctx.db.delete(blobTable).where(eq(blobTable.id, command.blobId));
    }
  } else {
    await ctx.db
      .update(blobTable)
      .set({ hash: command.hash })
      .where(eq(blobTable.id, command.blobId));
  }

  await ctx.db
    .update(fileTable)
    .set({ isActive: true })
    .where(eq(fileTable.id, command.fileId));

  return {
    result: {
      conflicted: conflictBlobRows.length > 0,
    },
    events: [],
  };
};
