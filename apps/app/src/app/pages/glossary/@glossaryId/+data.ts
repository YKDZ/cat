import { useSSCTRPC } from "@/server/trpc/sscClient";
import { redirect } from "vike/abort";
import type { PageContextServer } from "vike/types";

export const data = async (ctx: PageContextServer) => {
  const { glossaryId } = ctx.routeParams;

  const glossary = await useSSCTRPC(ctx).glossary.query({ id: glossaryId });

  if (!glossary) throw redirect("/project");

  return {
    glossary,
  };
};

export type Data = Awaited<ReturnType<typeof data>>;
