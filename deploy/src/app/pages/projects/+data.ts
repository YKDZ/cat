import { useSSCTRPC } from "@/server/trpc/sscClient";
import { redirect } from "vike/abort";
import { PageContext } from "vike/types";

export const data = async (ctx: PageContext) => {
  const { user } = ctx;

  if (!user) throw redirect("/auth");

  const projects = await useSSCTRPC({
    sessionId: ctx.sessionId,
    user,
  })
    .project.listUserParticipated({
      userId: user.id,
    })
    .catch((e) => {
      throw redirect("/");
    });

  return { projects };
};

export type Data = Awaited<ReturnType<typeof data>>;
