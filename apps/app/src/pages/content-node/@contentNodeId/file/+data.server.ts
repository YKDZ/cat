import {
  executeQuery,
  getContentNode,
  getContentNodeBlobInfo,
  getSessionStore,
} from "@cat/domain";
import {
  getDownloadUrl,
  resolveServiceImplementation,
} from "@cat/server-shared";
import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";

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
    storageProvider: import("@cat/shared").ServiceImplementationReference;
    key: string;
    fileName: string;
  } | null = null;

  if (
    fileInfo &&
    fileInfo.storageProvider !== null &&
    fileInfo.key !== null &&
    fileInfo.fileName !== null
  ) {
    activeFileInfo = {
      storageProvider: fileInfo.storageProvider,
      key: fileInfo.key,
      fileName: fileInfo.fileName,
    };

    const provider = resolveServiceImplementation(
      pluginManager,
      activeFileInfo.storageProvider,
      "STORAGE_PROVIDER",
    );

    const sessionStore = getSessionStore();
    fileUrl = await getDownloadUrl(
      sessionStore,
      provider,
      activeFileInfo.storageProvider,
      activeFileInfo.key,
      120,
      activeFileInfo.fileName,
    );
  }

  return { contentNode, fileInfo: activeFileInfo, fileUrl };
};

export type Data = Awaited<ReturnType<typeof data>>;
