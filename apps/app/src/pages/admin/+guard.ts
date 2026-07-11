import { render } from "vike/abort";
import type { PageContext } from "vike/types";

export const guard = async (ctx: PageContext) => {
  if (!ctx.user) throw render("/auth", `You must login to access`);
};
