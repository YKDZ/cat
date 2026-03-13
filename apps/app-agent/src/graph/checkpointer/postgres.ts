import type { AgentEvent } from "@/graph/events";
import type { BlackboardSnapshot, RunId } from "@/graph/types";

import type { Checkpointer, ExternalOutputRecord, RunMetadata } from "./types";

/**
 * Postgres Checkpointer（阶段 1 占位实现）
 *
 * 当前阶段优先保证 Graph 引擎接口稳定；
 * 真实的 DB 读写逻辑将在下一批提交中对接 drizzle 表。
 */
export class PostgresCheckpointer implements Checkpointer {
  saveRunMetadata = async (
    _runId: RunId,
    _metadata: Omit<RunMetadata, "runId">,
  ): Promise<void> => {
    throw new Error(
      "PostgresCheckpointer.saveRunMetadata is not implemented yet",
    );
  };

  loadRunMetadata = async (_runId: RunId): Promise<RunMetadata | null> => {
    throw new Error(
      "PostgresCheckpointer.loadRunMetadata is not implemented yet",
    );
  };

  saveSnapshot = async (
    _runId: RunId,
    _snapshot: BlackboardSnapshot,
  ): Promise<void> => {
    throw new Error("PostgresCheckpointer.saveSnapshot is not implemented yet");
  };

  loadSnapshot = async (_runId: RunId): Promise<BlackboardSnapshot | null> => {
    throw new Error("PostgresCheckpointer.loadSnapshot is not implemented yet");
  };

  saveEvent = async (_event: AgentEvent): Promise<void> => {
    throw new Error("PostgresCheckpointer.saveEvent is not implemented yet");
  };

  listEvents = async (_runId: RunId): Promise<AgentEvent[]> => {
    throw new Error("PostgresCheckpointer.listEvents is not implemented yet");
  };

  saveExternalOutput = async (_record: ExternalOutputRecord): Promise<void> => {
    throw new Error(
      "PostgresCheckpointer.saveExternalOutput is not implemented yet",
    );
  };

  loadExternalOutputByIdempotency = async (
    _runId: RunId,
    _idempotencyKey: string,
  ): Promise<ExternalOutputRecord | null> => {
    throw new Error(
      "PostgresCheckpointer.loadExternalOutputByIdempotency is not implemented yet",
    );
  };
}
