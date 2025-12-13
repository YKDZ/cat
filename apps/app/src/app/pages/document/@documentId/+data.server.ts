import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";
import type { Document } from "@cat/shared/schema/drizzle/document";
import { useSSCTRPC } from "@cat/app-api/trpc/sscClient";

export const data = async (
  ctx: PageContextServer,
): Promise<{ document: Document }> => {
  const { documentId } = ctx.routeParams;

  if (!documentId) throw render("/", `Document id not provided`);

  const document = await useSSCTRPC(ctx).document.get({
    documentId,
  });

  if (!document) throw render("/", `Document ${documentId} not found`);

  return { document };
};

export type Data = Awaited<ReturnType<typeof data>>;
