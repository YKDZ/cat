import type { StorageProvider } from "@cat/plugin-core";
import type { PageContextServer } from "vike/types";

import {
  getDownloadUrl,
  getServiceFromDBId,
} from "@cat/app-server-shared/utils";
import {
  blob as blobTable,
  document as documentTable,
  eq,
  file as fileTable,
} from "@cat/db";
import { assertSingleOrNull } from "@cat/shared/utils";
import { render } from "vike/abort";

export const data = async (ctx: PageContextServer) => {
  const { client: drizzle } = ctx.globalContext.drizzleDB;
  const { redis } = ctx.globalContext.redisDB;
  const { pluginManager } = ctx.globalContext;
  const { documentId } = ctx.routeParams;

  if (!documentId) throw render("/", `Document id not provided`);

  const document = assertSingleOrNull(
    await drizzle
      .select({ id: documentTable.id, name: documentTable.name })
      .from(documentTable)
      .where(eq(documentTable.id, documentId)),
  );

  if (!document) throw render("/", `Document ${documentId} not found`);

  // 获取文件信息
  const fileInfo = assertSingleOrNull(
    await drizzle
      .select({
        key: blobTable.key,
        storageProviderId: blobTable.storageProviderId,
        fileName: fileTable.name,
      })
      .from(documentTable)
      .innerJoin(fileTable, eq(fileTable.id, documentTable.fileId))
      .innerJoin(blobTable, eq(blobTable.id, fileTable.blobId))
      .where(eq(documentTable.id, documentId)),
  );

  let fileUrl: string | null = null;
  if (fileInfo) {
    const provider = getServiceFromDBId<StorageProvider>(
      pluginManager,
      fileInfo.storageProviderId,
    );

    fileUrl = await getDownloadUrl(
      redis,
      provider,
      fileInfo.storageProviderId,
      fileInfo.key,
      120,
      fileInfo.fileName,
    );
  }

  return { document, fileInfo, fileUrl };
};

export type Data = Awaited<ReturnType<typeof data>>;
