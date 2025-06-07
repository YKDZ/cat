import { useSSCTRPC } from "@/server/trpc/sscClient";
import { redirect } from "vike/abort";
import type { PageContextServer } from "vike/types";

export const data = async (ctx: PageContextServer) => {
  const { user } = ctx;

  if (!user) throw redirect("/auth");

  const projects = await useSSCTRPC(ctx)
    .project.listUserParticipated({
      userId: user.id,
    })
    .catch((e) => {
      throw redirect("/");
    });

  return { projects };
};

export type Data = Awaited<ReturnType<typeof data>>;
