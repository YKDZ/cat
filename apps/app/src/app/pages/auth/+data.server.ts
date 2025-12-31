import type { PageContextServer } from "vike/types";
import { ssc } from "@/server/ssc";

export const data = async (ctx: PageContextServer) => {
  const methods = await ssc(ctx).plugin.getAllAuthMethod();
  return { methods };
};

export type Data = Awaited<ReturnType<typeof data>>;
