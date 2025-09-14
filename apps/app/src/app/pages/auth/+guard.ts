import type { PageContext } from "vike/types";
import { render } from "vike/abort";

export const guard = async (ctx: PageContext) => {
  if (ctx.user) throw render("/", `You are already logged in`);
};
