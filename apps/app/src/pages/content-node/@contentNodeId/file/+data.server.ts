import type { StorageProvider } from "@cat/plugin-core";
import type { PageContextServer } from "vike/types";

import {
  executeQuery,
  getContentNode,
  getContentNodeBlobInfo,
  getSessionStore,
} from "@cat/domain";
import { getDownloadUrl, getServiceFromDBId } from "@cat/server-shared";
import { render } from "vike/abort";

export const data = async (ctx: PageContextServer) => {
  const { client: drizzle } = ctx.globalContext.drizzleDB;
  const { pluginManager } = ctx.globalContext;
  const { contentNodeId } = ctx.routeParams;

  if (!contentNodeId) throw render("/", "Content node id not provided");

  const contentNode = await executeQuery({ db: drizzle }, getContentNode, {
    id: contentNodeId,
  });

  if (!contentNode) {
    throw render("/", `Content node ${contentNodeId} not found`);
  }

  const fileInfo = await executeQuery({ db: drizzle }, getContentNodeBlobInfo, {
    contentNodeId,
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

  return { contentNode, fileInfo: activeFileInfo, fileUrl };
};

export type Data = Awaited<ReturnType<typeof data>>;
