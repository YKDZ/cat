import type { PageContextServer } from "vike/types";

import { loadProjectShell } from "./project-shell.server";

export const data = async (ctx: PageContextServer) => {
  const projectShell = await loadProjectShell(ctx);

  return {
    ...projectShell,
    projectShell,
  };
};

export type Data = Awaited<ReturnType<typeof data>>;
