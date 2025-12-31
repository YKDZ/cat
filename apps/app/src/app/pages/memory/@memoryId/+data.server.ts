import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";
import { ssc } from "@/server/ssc";

export const data = async (ctx: PageContextServer) => {
  const { memoryId } = ctx.routeParams;

  if (!memoryId) throw render("/", "Memory id is required");

  const memory = await ssc(ctx).memory.get({ memoryId });

  if (!memory) throw render(`/memories`, `Memory ${memoryId} not found`);

  return {
    memory,
  };
};

export type Data = Awaited<ReturnType<typeof data>>;
