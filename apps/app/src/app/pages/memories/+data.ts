import { useSSCTRPC } from "@/server/trpc/sscClient";
import { redirect } from "vike/abort";
import type { PageContextServer } from "vike/types";

export const data = async (ctx: PageContextServer) => {
  const { user } = ctx;

  if (!user) throw redirect("/");

  const memories = await useSSCTRPC(ctx)
    .memory.listUserOwned({ userId: user.id })
    .catch(() => {
      throw redirect("/");
    });

  return { memories };
};

export type Data = Awaited<ReturnType<typeof data>>;
