import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";
import { useSSCTRPC } from "@cat/app-api/trpc/sscClient";

export const data = async (ctx: PageContextServer) => {
  const { memoryId } = ctx.routeParams;

  if (!memoryId) throw render("/", "Memory id is required");

  const memory = await useSSCTRPC(ctx).memory.get({ id: memoryId });

  if (!memory) throw render(`/memories`, `Memory ${memoryId} not found`);

  return {
    memory,
  };
};

export type Data = Awaited<ReturnType<typeof data>>;
