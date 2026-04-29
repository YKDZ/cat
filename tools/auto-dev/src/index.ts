export const AUTO_DEV_VERSION = "0.0.1";

export type { AutoDevConfig, AgentRegistration } from "./config/types.js";
export { DEFAULT_CONFIG } from "./config/types.js";
export { AutoDevConfigSchema } from "./config/schema.js";

export type {
  WorkflowRun,
  DecisionBlock,
  DecisionResponse,
  AuditEvent,
  NotificationEvent,
  AgentProvider,
  AgentModel,
} from "./shared/types.js";

export { Coordinator } from "./coordinator/index.js";
export { AgentDispatcher } from "./agent-dispatcher/index.js";

export { DecisionSocketServer } from "./decision-service/index.js";
export { DecisionManager } from "./decision-service/index.js";
export { BranchManager } from "./branch-manager/index.js";
export { ValidationGate } from "./validation/index.js";
export { AuditLogger } from "./audit-logger/index.js";
