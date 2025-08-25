import { useSSCTRPC } from "@/server/trpc/sscClient";
import { redirect } from "vike/abort";
import type { PageContextServer } from "vike/types";

export const data = async (ctx: PageContextServer) => {
  const { documentId } = ctx.routeParams;

  if (!documentId) throw redirect("/");

  const document = await useSSCTRPC(ctx).document.query({
    id: documentId,
  });

  if (!document) throw redirect("/");

  return { document };
};

export type Data = Awaited<ReturnType<typeof data>>;
