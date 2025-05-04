import { useProjectStore } from "@/app/stores/project";
import { EMPTY_CONTEXT } from "@/server/trpc/context";
import { projectRouter } from "@/server/trpc/routers/project";
import { createCallerFactory } from "@/server/trpc/server";
import { ProjectSchema } from "@cat/shared";
import { redirect } from "vike/abort";
import { PageContext } from "vike/types";
import { z } from "zod";

export const data = async (ctx: PageContext) => {
  const createCaller = createCallerFactory(projectRouter);
  const caller = createCaller({
    ...EMPTY_CONTEXT,
    user: ctx.user,
    sessionId: ctx.sessionId,
  });

  const projects = z.array(ProjectSchema).parse(
    await caller.listParticipated().catch((e) => {
      console.log(e);
      throw redirect("/");
    }),
  );

  useProjectStore(ctx.pinia).addProjects(...projects);
};
