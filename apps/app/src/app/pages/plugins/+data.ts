import { useSSCTRPC } from "@/server/trpc/sscClient";
import { PageContext } from "vike/types";

export const data = async (ctx: PageContext) => {
  const plugins = useSSCTRPC({ ...ctx }).plugin.listAll();
  return { plugins };
};

export type Data = Awaited<ReturnType<typeof data>>;
