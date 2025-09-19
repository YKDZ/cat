import type { PageContextServer } from "vike/types";
import { render } from "vike/abort";
import { useSSCTRPC } from "@cat/app-api/trpc/sscClient";

export const data = async (ctx: PageContextServer) => {
  const { projectId } = ctx.routeParams;

  if (!projectId) throw render(`/`, `Project id is required`);

  const documents = await useSSCTRPC(ctx).project.getDocuments({
    projectId,
  });

  return { documents };
};

export type Data = Awaited<ReturnType<typeof data>>;
