import { useSSCTRPC } from "@/server/trpc/sscClient";
import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";

export const data = async (ctx: PageContextServer) => {
  const { memoryId } = ctx.routeParams;

  const memory = await useSSCTRPC(ctx).memory.query({ id: memoryId });

  if (!memory) throw render(`/memories`, `Memory ${memoryId} not found`);

  return {
    memory,
  };
};

export type Data = Awaited<ReturnType<typeof data>>;
