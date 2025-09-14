import type { PageContextServer } from "vike/types";
import { useSSCTRPC } from "@/server/trpc/sscClient.ts";

export const data = async (ctx: PageContextServer) => {
  const methods = await useSSCTRPC(ctx).auth.availableAuthMethod();
  return { methods };
};

export type Data = Awaited<ReturnType<typeof data>>;
