import type { PageContext } from "vike/types";
import { redirect } from "vike/abort";

export const guard = async (ctx: PageContext) => {
  if (ctx.user) throw redirect("/");
};
