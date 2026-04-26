import type { PageContextServer } from "vike/types";

import { executeQuery, getGlossary } from "@cat/domain";
import { render } from "vike/abort";

export const data = async (ctx: PageContextServer) => {
  const { client: drizzle } = ctx.globalContext.drizzleDB;
  const { glossaryId } = ctx.routeParams;

  if (!glossaryId) throw render("/", "Glossary id is required");

  const glossary = await executeQuery({ db: drizzle }, getGlossary, {
    glossaryId,
  });

  if (!glossary)
    throw render(`/glossaries/`, `Glossary ${glossaryId} does not exists`);

  return {
    glossary,
  };
};

export type Data = Awaited<ReturnType<typeof data>>;
