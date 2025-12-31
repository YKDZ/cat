import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";
import { ssc } from "@/server/ssc";

export const data = async (ctx: PageContextServer) => {
  const { glossaryId } = ctx.routeParams;

  if (!glossaryId) throw render("/", "Glossary id is required");

  const glossary = await ssc(ctx).glossary.get({ glossaryId });

  if (!glossary)
    throw render(`/glossaries/`, `Glossary ${glossaryId} does not exists`);

  return {
    glossary,
  };
};

export type Data = Awaited<ReturnType<typeof data>>;
