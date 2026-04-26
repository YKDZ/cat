import type { StorageProvider } from "@cat/plugin-core";
import type { PageContextServer } from "vike/types";

import {
  executeQuery,
  getDocument,
  getDocumentBlobInfo,
  getSessionStore,
} from "@cat/domain";
import { getDownloadUrl, getServiceFromDBId } from "@cat/server-shared";
import { render } from "vike/abort";

export const data = async (ctx: PageContextServer) => {
  const { client: drizzle } = ctx.globalContext.drizzleDB;
  const { pluginManager } = ctx.globalContext;
  const { documentId } = ctx.routeParams;

  if (!documentId) throw render("/", `Document id not provided`);

  const document = await executeQuery({ db: drizzle }, getDocument, {
    documentId,
  });

  if (!document) throw render("/", `Document ${documentId} not found`);

  // 获取文件信息
  const fileInfo = await executeQuery({ db: drizzle }, getDocumentBlobInfo, {
    documentId,
  });

  let fileUrl: string | null = null;
  let activeFileInfo: {
    storageProviderId: number;
    key: string;
    fileName: string;
  } | null = null;

  if (
    fileInfo &&
    fileInfo.storageProviderId !== null &&
    fileInfo.key !== null &&
    fileInfo.fileName !== null
  ) {
    activeFileInfo = {
      storageProviderId: fileInfo.storageProviderId,
      key: fileInfo.key,
      fileName: fileInfo.fileName,
    };

    const provider = getServiceFromDBId<StorageProvider>(
      pluginManager,
      activeFileInfo.storageProviderId,
    );

    const sessionStore = getSessionStore();
    fileUrl = await getDownloadUrl(
      sessionStore,
      provider,
      activeFileInfo.storageProviderId,
      activeFileInfo.key,
      120,
      activeFileInfo.fileName,
    );
  }

  return { document, fileInfo: activeFileInfo, fileUrl };
};

export type Data = Awaited<ReturnType<typeof data>>;
