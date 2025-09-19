import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";
import { useSSCTRPC } from "@cat/app-api/trpc/sscClient";

export const data = async (ctx: PageContextServer) => {
  const { glossaryId } = ctx.routeParams;

  if (!glossaryId) throw render("/", "Glossary id is required");

  const glossary = await useSSCTRPC(ctx).glossary.query({ id: glossaryId });

  if (!glossary)
    throw render(`/glossaries/`, `Glossary ${glossaryId} does not exists`);

  return {
    glossary,
  };
};

export type Data = Awaited<ReturnType<typeof data>>;
