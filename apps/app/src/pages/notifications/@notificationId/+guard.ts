import { render } from "vike/abort";
import type { PageContext } from "vike/types";

export const guard = (ctx: PageContext) => {
  if (!ctx.user) throw render("/auth", "You must login to access");
};
