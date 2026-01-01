import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";
import { document as documentTable, eq } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared/utils";

export const data = async (ctx: PageContextServer) => {
  const { client: drizzle } = ctx.globalContext.drizzleDB;
  const { documentId } = ctx.routeParams;

  if (!documentId) throw render("/", `Document id not provided`);

  const document = assertSingleOrNull(
    await drizzle
      .select({ id: documentTable.id, name: documentTable.name })
      .from(documentTable)
      .where(eq(documentTable.id, documentId)),
  );

  if (!document) throw render("/", `Document ${documentId} not found`);

  return { document };
};

export type Data = Awaited<ReturnType<typeof data>>;
