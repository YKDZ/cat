import type { Project } from "@cat/shared/schema/drizzle/project";
import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";
import { ssc } from "@/server/ssc";

export const data = async (
  ctx: PageContextServer,
): Promise<{ projects: Project[] }> => {
  const { user } = ctx;

  if (!user) throw render("/auth");

  const owned = await ssc(ctx).project.getUserOwned({});

  return { projects: owned };
};

export type Data = Awaited<ReturnType<typeof data>>;
