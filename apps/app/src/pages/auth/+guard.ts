import { redirect } from "vike/abort";
import type { PageContext } from "vike/types";

export const guard = async (ctx: PageContext) => {
  if (ctx.user) throw redirect("/");
};
