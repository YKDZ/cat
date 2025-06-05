import { useSSCTRPC } from "@/server/trpc/sscClient";
import { redirect } from "vike/abort";
import { PageContext } from "vike/types";

export const data = async (ctx: PageContext) => {
  const { projectId } = ctx.routeParams;

  const project = await useSSCTRPC({ ...ctx }).project.query({ id: projectId });

  if (!project) throw redirect("/project");

  return { project };
};

export type Data = Awaited<ReturnType<typeof data>>;
