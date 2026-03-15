import type { PageContextServer } from "vike/types";

import { executeQuery, listOwnedProjects } from "@cat/domain";
import { render } from "vike/abort";

export const data = async (ctx: PageContextServer) => {
  const { client: drizzle } = ctx.globalContext.drizzleDB;
  const { user } = ctx;

  if (!user) throw render("/auth");

  const projects = await executeQuery({ db: drizzle }, listOwnedProjects, {
    creatorId: user.id,
  });

  return { projects };
};

export type Data = Awaited<ReturnType<typeof data>>;
