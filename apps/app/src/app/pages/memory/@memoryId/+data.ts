import { useSSCTRPC } from "@/server/trpc/sscClient";
import { redirect } from "vike/abort";
import type { PageContextServer } from "vike/types";

export const data = async (ctx: PageContextServer) => {
  const { memoryId } = ctx.routeParams;

  const memory = await useSSCTRPC(ctx).memory.query({ id: memoryId });

  if (!memory) throw redirect("/");

  return {
    memory,
  };
};

export type Data = Awaited<ReturnType<typeof data>>;
