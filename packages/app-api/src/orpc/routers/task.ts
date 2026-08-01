import { randomUUID } from "node:crypto";

import {
  executeQuery,
  getLocalizationTask,
  getOperationFailure,
  listLocalizationTasks,
} from "@cat/domain";
import { getPermissionEngine } from "@cat/permissions";
import { BatchAutoTranslationTaskAdapter } from "@cat/workflow/tasks";
import { ORPCError } from "@orpc/server";
import * as z from "zod";

import { authed } from "#/orpc/server.ts";
import { getGraphRuntime } from "#/utils/graph-runtime.ts";

const listInput = z.object({
  projectId: z.uuidv4(),
  status: z
    .enum([
      "PENDING",
      "RUNNING",
      "BLOCKED",
      "CANCEL_REQUESTED",
      "COMPLETED",
      "FAILED",
      "CANCELED",
    ])
    .optional(),
  pageSize: z.int().min(1).max(100).default(20),
  cursor: z.object({ updatedAt: z.iso.datetime(), id: z.uuidv4() }).optional(),
});

const taskInput = z.object({ projectId: z.uuidv4(), taskId: z.uuidv4() });
const taskMutationInput = taskInput.extend({
  requestId: z.uuidv4().default(() => randomUUID()),
});

const authorizationForProject = (input: {
  userId: string;
  projectId: string;
  systemAdmin: boolean;
}) => ({
  viewerId: input.userId,
  authorizedProjectIds: [input.projectId],
  systemAdmin: input.systemAdmin,
});

const assertTaskAccess = async (input: {
  auth: Parameters<ReturnType<typeof getPermissionEngine>["check"]>[0];
  projectId: string;
  relation: "viewer" | "editor";
}): Promise<boolean> => {
  const engine = getPermissionEngine();
  const systemAdmin = await engine.check(
    input.auth,
    { type: "system", id: "*" },
    "admin",
  );
  if (systemAdmin) return true;

  const permitted = await engine.check(
    input.auth,
    { type: "project", id: input.projectId },
    input.relation,
  );
  if (!permitted) throw new ORPCError("FORBIDDEN");
  return false;
};

export const list = authed
  .input(listInput)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
      user,
      auth,
    } = context;
    const systemAdmin = await assertTaskAccess({
      auth,
      projectId: input.projectId,
      relation: "viewer",
    });
    return await executeQuery({ db }, listLocalizationTasks, {
      ...input,
      authorization: authorizationForProject({
        userId: user.id,
        projectId: input.projectId,
        systemAdmin,
      }),
    });
  });

export const detail = authed
  .input(taskInput)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
      user,
      auth,
    } = context;
    const systemAdmin = await assertTaskAccess({
      auth,
      projectId: input.projectId,
      relation: "viewer",
    });
    const result = await executeQuery({ db }, getLocalizationTask, {
      taskId: input.taskId,
      authorization: authorizationForProject({
        userId: user.id,
        projectId: input.projectId,
        systemAdmin,
      }),
    });
    if (
      !result ||
      result.state.scope.type !== "PROJECT" ||
      result.state.scope.id !== input.projectId
    ) {
      throw new ORPCError("NOT_FOUND");
    }
    const authorization = authorizationForProject({
      userId: user.id,
      projectId: input.projectId,
      systemAdmin,
    });
    const currentFailure = result.state.currentFailureId
      ? await executeQuery({ db }, getOperationFailure, {
          id: result.state.currentFailureId,
          authorization,
        })
      : null;
    return { task: result, currentFailure };
  });

export const cancel = authed
  .input(taskMutationInput)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
      pluginManager,
      user,
      auth,
    } = context;
    const systemAdmin = await assertTaskAccess({
      auth,
      projectId: input.projectId,
      relation: "editor",
    });
    const authorization = authorizationForProject({
      userId: user.id,
      projectId: input.projectId,
      systemAdmin,
    });
    const current = await executeQuery({ db }, getLocalizationTask, {
      taskId: input.taskId,
      authorization,
    });
    if (
      !current ||
      current.state.scope.type !== "PROJECT" ||
      current.state.scope.id !== input.projectId
    ) {
      throw new ORPCError("NOT_FOUND");
    }

    const runtime = await getGraphRuntime(db, pluginManager);
    const adapter = await BatchAutoTranslationTaskAdapter.hydrate(
      db,
      current.id,
    );
    await adapter.requestCancel({ requestId: input.requestId });
    const runId = adapter.task.state.runtime.runId;
    if (runId && runtime.scheduler.hasRun(runId)) {
      await runtime.scheduler.cancel(runId);
    } else {
      await runtime.taskProjector.reconcile();
    }
    return await adapter.refresh();
  });

export const retry = authed
  .input(taskInput)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
      user,
      pluginManager,
      auth,
    } = context;
    const systemAdmin = await assertTaskAccess({
      auth,
      projectId: input.projectId,
      relation: "editor",
    });
    const current = await executeQuery({ db }, getLocalizationTask, {
      taskId: input.taskId,
      authorization: authorizationForProject({
        userId: user.id,
        projectId: input.projectId,
        systemAdmin,
      }),
    });
    if (
      !current ||
      current.state.scope.type !== "PROJECT" ||
      current.state.scope.id !== input.projectId
    ) {
      throw new ORPCError("NOT_FOUND");
    }
    const runtime = await getGraphRuntime(db, pluginManager);
    return await runtime.taskService.retryAndSchedule({
      taskId: current.id,
      actorId: user.id,
    });
  });

export const resume = authed
  .input(taskMutationInput)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
      user,
      pluginManager,
      auth,
    } = context;
    const systemAdmin = await assertTaskAccess({
      auth,
      projectId: input.projectId,
      relation: "editor",
    });
    const current = await executeQuery({ db }, getLocalizationTask, {
      taskId: input.taskId,
      authorization: authorizationForProject({
        userId: user.id,
        projectId: input.projectId,
        systemAdmin,
      }),
    });
    if (
      !current ||
      current.state.scope.type !== "PROJECT" ||
      current.state.scope.id !== input.projectId
    ) {
      throw new ORPCError("NOT_FOUND");
    }
    const runtime = await getGraphRuntime(db, pluginManager);
    return await runtime.taskService.resumeAndSchedule({
      taskId: current.id,
      requestId: input.requestId,
    });
  });
