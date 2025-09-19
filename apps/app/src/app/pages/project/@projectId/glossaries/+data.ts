import type { PageContextServer } from "vike/types";
import { render } from "vike/abort";
import { useSSCTRPC } from "@cat/app-api/trpc/sscClient";

export const data = async (ctx: PageContextServer) => {
  const { projectId } = ctx.routeParams;

  console.log(`projectId`, projectId);

  if (!projectId) throw render(`/`, `Project id is required`);

  const glossaries = await useSSCTRPC(ctx).glossary.listProjectOwned({
    projectId,
  });

  return { glossaries };
};

export type Data = Awaited<ReturnType<typeof data>>;
