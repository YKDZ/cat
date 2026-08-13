import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";
import * as z from "zod";

import { ssc } from "#/server/ssc.ts";

import { withProjectShell } from "../project-shell.server.ts";

export const data = async (ctx: PageContextServer) => {
  const { projectId } = ctx.routeParams;

  if (!projectId) throw render(`/`, `Project id is required`);

  const requestedTaskId = new URLSearchParams(
    ctx.urlParsed.searchOriginal ?? "",
  ).get("taskId");
  const parsedTaskId = z.uuidv4().safeParse(requestedTaskId);

  return await withProjectShell(ctx, async () => {
    const tasks = await ssc(ctx).task.list({ projectId, pageSize: 20 });
    if (requestedTaskId === null) {
      return {
        projectId,
        tasks,
        selectedDetail: undefined,
        detailAvailability: null,
      };
    }
    if (!parsedTaskId.success) {
      return {
        projectId,
        tasks,
        selectedDetail: undefined,
        detailAvailability: "invalid" as const,
      };
    }

    try {
      const selectedDetail = await ssc(ctx).task.detail({
        projectId,
        taskId: parsedTaskId.data,
      });
      return {
        projectId,
        tasks,
        selectedDetail,
        detailAvailability: null,
      };
    } catch {
      // Detail authorization intentionally shares one public unavailable state.
      return {
        projectId,
        tasks,
        selectedDetail: undefined,
        detailAvailability: "unavailable" as const,
      };
    }
  });
};

export type Data = Awaited<ReturnType<typeof data>>;
