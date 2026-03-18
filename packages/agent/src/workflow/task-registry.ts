import type { WorkflowRuntime } from "@/workflow/types";

import {
  configureWorkflowRuntime,
  createWorkflowRuntime,
  getWorkflowRuntime,
  resetWorkflowRuntime,
} from "@/workflow/runtime";

export class TaskRegistry {
  static init = (runtime?: Partial<WorkflowRuntime>): WorkflowRuntime => {
    const resolved = createWorkflowRuntime(runtime);
    configureWorkflowRuntime(resolved);
    return resolved;
  };

  static getRuntime = (): WorkflowRuntime => {
    return getWorkflowRuntime();
  };

  static reset = (): WorkflowRuntime => {
    return resetWorkflowRuntime();
  };
}
