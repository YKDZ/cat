import type { PageContextServer } from "vike/types";

export const data = async (ctx: PageContextServer) => {
  return { plugins: [] };
};

export type Data = Awaited<ReturnType<typeof data>>;
