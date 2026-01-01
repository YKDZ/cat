import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";
import { eq, memory } from "@cat/db";

export const data = async (ctx: PageContextServer) => {
  const { client: drizzle } = ctx.globalContext.drizzleDB;
  const { user } = ctx;

  if (!user) throw render("/", `You must login to access`);

  const memories = await drizzle
    .select({
      id: memory.id,
      name: memory.name,
      description: memory.description,
    })
    .from(memory)
    .where(eq(memory.creatorId, user.id));

  return { memories };
};

export type Data = Awaited<ReturnType<typeof data>>;
