import type { PageContextServer } from "vike/types";

import {
  executeQuery,
  getGlossary,
  listGlossaryProjectIds,
} from "@cat/domain";
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

  const glossaryProjectIds = await executeQuery(
    { db: drizzle },
    listGlossaryProjectIds,
    { glossaryId },
  );

  return {
    glossary,
    glossaryProjectIds,
  };
};

export type Data = Awaited<ReturnType<typeof data>>;
