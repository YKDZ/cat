import type { PageContext } from "vike/types";
import { render } from "vike/abort";

export const guard = (ctx: PageContext) => {
  if (!ctx.user) throw render("/auth", `You must login to access`);
};
