import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";
import { eq, project } from "@cat/db";

export const data = async (ctx: PageContextServer) => {
  const { client: drizzle } = ctx.globalContext.drizzleDB;
  const { user } = ctx;

  if (!user) throw render("/auth");

  const projects = await drizzle
    .select({
      id: project.id,
      name: project.name,
    })
    .from(project)
    .where(eq(project.creatorId, user.id));

  return { projects };
};

export type Data = Awaited<ReturnType<typeof data>>;
