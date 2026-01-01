import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";
import { eq, glossary as glossaryTable } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared/utils";

export const data = async (ctx: PageContextServer) => {
  const { client: drizzle } = ctx.globalContext.drizzleDB;
  const { glossaryId } = ctx.routeParams;

  if (!glossaryId) throw render("/", "Glossary id is required");

  const glossary = assertSingleOrNull(
    await drizzle
      .select({
        id: glossaryTable.id,
        name: glossaryTable.name,
        creatorId: glossaryTable.creatorId,
      })
      .from(glossaryTable)
      .where(eq(glossaryTable.id, glossaryId)),
  );

  if (!glossary)
    throw render(`/glossaries/`, `Glossary ${glossaryId} does not exists`);

  return {
    glossary,
  };
};

export type Data = Awaited<ReturnType<typeof data>>;
