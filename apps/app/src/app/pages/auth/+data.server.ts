import type { PageContextServer } from "vike/types";
import { useSSCTRPC } from "@cat/app-api/trpc/sscClient";

export const data = async (ctx: PageContextServer) => {
  const methods = await useSSCTRPC(ctx).plugin.availableAuthMethod();
  return { methods };
};

export type Data = Awaited<ReturnType<typeof data>>;
