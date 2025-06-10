import type { PageContextServer } from "vike/types";
import { redirect } from "vike/abort";

export const guard = async (ctx: PageContextServer) => {
  if (ctx.isInited !== false) throw redirect("/");
};
