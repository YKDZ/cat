import { useSSCTRPC } from "@/server/trpc/sscClient";
import { PageContext } from "vike/types";

export const data = async (ctx: PageContext) => {
  const methods = await useSSCTRPC({ ...ctx }).auth.misc.availableAuthMethod();
  return { methods };
};

export type Data = Awaited<ReturnType<typeof data>>;
