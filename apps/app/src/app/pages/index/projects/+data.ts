import type { Project } from "@cat/shared/schema/prisma/project";
import { logger } from "@cat/shared/utils";
import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";
import { useSSCTRPC } from "@/server/trpc/sscClient.ts";

export const data = async (
  ctx: PageContextServer,
): Promise<{ projects: Project[] }> => {
  const { user } = ctx;

  if (!user) throw render("/auth");

  const participated = await useSSCTRPC(ctx)
    .project.listUserParticipated({
      userId: user.id,
    })
    .catch((e) => {
      logger.error("WEB", { msg: "Failed to fetch projects" }, e);
      throw render("/");
    });

  const owned = await useSSCTRPC(ctx)
    .project.listUserOwned()
    .catch((e) => {
      logger.error("WEB", { msg: "Failed to fetch projects" }, e);
      throw render("/");
    });

  return { projects: [...participated, ...owned] };
};

export type Data = Awaited<ReturnType<typeof data>>;
