import { EMPTY_CONTEXT } from "@/server/trpc/context";
import { projectRouter } from "@/server/trpc/routers/project";
import { createCallerFactory } from "@/server/trpc/server";
import { redirect } from "vike/abort";
import { PageContext } from "vike/types";

export const data = async (ctx: PageContext) => {
  const { projectId } = ctx.routeParams;

  const createCaller = createCallerFactory(projectRouter);
  const caller = createCaller({
    ...EMPTY_CONTEXT,
    user: ctx.user,
  });

  const project = await caller.query({ id: projectId });

  if (!project) throw redirect("/project");

  return { project };
};

export type Data = Awaited<ReturnType<typeof data>>;
