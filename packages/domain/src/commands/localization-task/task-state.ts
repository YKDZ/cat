import type { TaskStatus } from "@cat/shared";

export type TaskTransition =
  | "start"
  | "claimDispatch"
  | "bindRun"
  | "bindRunAndStart"
  | "progress"
  | "block"
  | "resume"
  | "complete"
  | "fail"
  | "requestCancel"
  | "confirmCancel";

const allowed: Readonly<Record<TaskStatus, readonly TaskTransition[]>> = {
  PENDING: [
    "claimDispatch",
    "bindRun",
    "bindRunAndStart",
    "start",
    "fail",
    "requestCancel",
  ],
  RUNNING: [
    "bindRun",
    "progress",
    "block",
    "complete",
    "fail",
    "requestCancel",
  ],
  BLOCKED: ["resume", "fail", "requestCancel"],
  CANCEL_REQUESTED: ["bindRun", "complete", "fail", "confirmCancel"],
  COMPLETED: [],
  FAILED: [],
  CANCELED: [],
};

const target: Readonly<Record<TaskTransition, TaskStatus>> = {
  start: "RUNNING",
  claimDispatch: "PENDING",
  bindRun: "PENDING",
  bindRunAndStart: "RUNNING",
  progress: "RUNNING",
  block: "BLOCKED",
  resume: "PENDING",
  complete: "COMPLETED",
  fail: "FAILED",
  requestCancel: "CANCEL_REQUESTED",
  confirmCancel: "CANCELED",
};

export class TaskNotFoundError extends Error {
  public constructor(taskId: string) {
    super(`Localization task ${taskId} was not found.`);
    this.name = "TaskNotFoundError";
  }
}

export class TaskRevisionConflictError extends Error {
  public constructor(expectedRevision: number, actualRevision?: number) {
    super(
      actualRevision === undefined
        ? `Task revision conflict: expected ${expectedRevision}.`
        : `Task revision conflict: expected ${expectedRevision}, found ${actualRevision}.`,
    );
    this.name = "TaskRevisionConflictError";
  }
}

export class InvalidTaskTransitionError extends Error {
  public constructor(current: TaskStatus, transition: TaskTransition) {
    super(`Task transition ${transition} is not valid from ${current}.`);
    this.name = "InvalidTaskTransitionError";
  }
}

export class InvalidTaskProgressError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "InvalidTaskProgressError";
  }
}

export class TaskCancellationNotAllowedError extends Error {
  public constructor(taskId: string) {
    super(`Localization task ${taskId} cannot be canceled.`);
    this.name = "TaskCancellationNotAllowedError";
  }
}

export class TaskDispatchClaimConflictError extends Error {
  public constructor(taskId: string) {
    super(`Localization task ${taskId} already has an active dispatch claim.`);
    this.name = "TaskDispatchClaimConflictError";
  }
}

export class TaskTransitionRequestConflictError extends Error {
  public constructor(taskId: string, requestId: string) {
    super(
      `Task transition request ${requestId} for ${taskId} was reused with a different intent.`,
    );
    this.name = "TaskTransitionRequestConflictError";
  }
}

export const transitionTaskStatus = (
  current: TaskStatus,
  transition: TaskTransition,
): TaskStatus => {
  if (!allowed[current].includes(transition)) {
    throw new InvalidTaskTransitionError(current, transition);
  }

  if (transition === "bindRun") return current;
  return target[transition];
};

export const assertExpectedRevision = (
  actual: number,
  expected: number,
): void => {
  if (actual !== expected) {
    throw new TaskRevisionConflictError(expected, actual);
  }
};
