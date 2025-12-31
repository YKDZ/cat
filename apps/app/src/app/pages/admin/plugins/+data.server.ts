import type { PageContextServer } from "vike/types";
import { ssc } from "@/server/ssc";

export const data = async (ctx: PageContextServer) => {
  const plugins = await ssc(ctx).plugin.getAll({});
  return { plugins };
};

export type Data = Awaited<ReturnType<typeof data>>;
