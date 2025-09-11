import { useSSCTRPC } from "@/server/trpc/sscClient";
import { logger } from "@cat/shared/utils";
import { redirect } from "vike/abort";
import type { PageContextServer } from "vike/types";

export const data = async (ctx: PageContextServer) => {
  const { user } = ctx;

  if (!user) throw redirect("/auth");

  const participated = await useSSCTRPC(ctx)
    .project.listUserParticipated({
      userId: user.id,
    })
    .catch((e) => {
      logger.error("WEB", { msg: "Failed to fetch projects" }, e);
      throw redirect("/");
    });

  const owned = await useSSCTRPC(ctx)
    .project.listUserOwned()
    .catch((e) => {
      logger.error("WEB", { msg: "Failed to fetch projects" }, e);
      throw redirect("/");
    });

  return { projects: [...participated, ...owned] };
};

export type Data = Awaited<ReturnType<typeof data>>;
