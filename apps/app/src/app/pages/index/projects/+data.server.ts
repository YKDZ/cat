import type { Project } from "@cat/shared/schema/prisma/project";
import { logger } from "@cat/shared/utils";
import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";
import { useSSCTRPC } from "@cat/app-api/trpc/sscClient";

export const data = async (
  ctx: PageContextServer,
): Promise<{ projects: Project[] }> => {
  const { user } = ctx;

  if (!user) throw render("/auth");

  const owned = await useSSCTRPC(ctx)
    .project.listUserOwned()
    .catch((e) => {
      logger.error("WEB", { msg: "Failed to fetch projects" }, e);
      throw render("/");
    });

  return { projects: owned };
};

export type Data = Awaited<ReturnType<typeof data>>;
