import type { PageContextServer } from "vike/types";
import { render } from "vike/abort";
import { useSSCTRPC } from "@cat/app-api/trpc/sscClient";

export const data = async (ctx: PageContextServer) => {
  const { projectId } = ctx.routeParams;

  if (!projectId) throw render(`/`, `Project id is required`);

  const memories = await useSSCTRPC(ctx).memory.listProjectOwned({
    projectId,
  });

  return { memories };
};

export type Data = Awaited<ReturnType<typeof data>>;
