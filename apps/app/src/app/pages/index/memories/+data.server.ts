import type { PageContextServer } from "vike/types";

import { executeQuery, listOwnedMemories } from "@cat/domain";
import { render } from "vike/abort";

export const data = async (ctx: PageContextServer) => {
  const { client: drizzle } = ctx.globalContext.drizzleDB;
  const { user } = ctx;

  if (!user) throw render("/", `You must login to access`);

  const memories = await executeQuery({ db: drizzle }, listOwnedMemories, {
    creatorId: user.id,
  });

  return { memories };
};

export type Data = Awaited<ReturnType<typeof data>>;
