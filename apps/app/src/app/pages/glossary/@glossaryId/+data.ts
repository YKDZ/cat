import { useSSCTRPC } from "@/server/trpc/sscClient";
import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";

export const data = async (ctx: PageContextServer) => {
  const { glossaryId } = ctx.routeParams;

  const glossary = await useSSCTRPC(ctx).glossary.query({ id: glossaryId });

  if (!glossary)
    throw render(`/glossaries/`, `Glossary ${glossaryId} does not exists`);

  return {
    glossary,
  };
};

export type Data = Awaited<ReturnType<typeof data>>;
