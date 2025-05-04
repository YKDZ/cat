import { useProjectStore } from "@/app/stores/project";
import { EMPTY_CONTEXT } from "@/server/trpc/context";
import { projectRouter } from "@/server/trpc/routers/project";
import { createCallerFactory } from "@/server/trpc/server";
import { ProjectSchema } from "@cat/shared";
import { PageContext } from "vike/types";

export const data = async (ctx: PageContext) => {
  const { projectId } = ctx.routeParams;

  const createCaller = createCallerFactory(projectRouter);
  const caller = createCaller({
    ...EMPTY_CONTEXT,
    user: ctx.user,
  });

  const project = ProjectSchema.parse(await caller.query({ id: projectId }));

  useProjectStore(ctx.pinia).addProjects(project);
};
