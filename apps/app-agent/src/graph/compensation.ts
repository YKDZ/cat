import type { RunId } from "@/graph/types";

export type CompensationHandler = () => Promise<void>;

export type CompensationRecord = {
  runId: RunId;
  nodeId?: string;
  label?: string;
  handler: CompensationHandler;
};

export type CompensationRegistry = {
  register: (record: CompensationRecord) => void;
  execute: (runId: RunId) => Promise<{ executed: number; failed: number }>;
  clear: (runId: RunId) => void;
  count: (runId: RunId) => number;
};

export class InMemoryCompensationRegistry implements CompensationRegistry {
  private readonly records = new Map<RunId, CompensationRecord[]>();

  register = (record: CompensationRecord): void => {
    const current = this.records.get(record.runId) ?? [];
    current.push(record);
    this.records.set(record.runId, current);
  };

  execute = async (
    runId: RunId,
  ): Promise<{ executed: number; failed: number }> => {
    const current = this.records.get(runId) ?? [];
    const reversed = [...current].reverse();
    let executed = 0;
    let failed = 0;

    for (const record of reversed) {
      try {
        // oxlint-disable-next-line no-await-in-loop
        await record.handler();
        executed += 1;
      } catch {
        failed += 1;
      }
    }

    this.records.delete(runId);
    return { executed, failed };
  };

  clear = (runId: RunId): void => {
    this.records.delete(runId);
  };

  count = (runId: RunId): number => {
    return (this.records.get(runId) ?? []).length;
  };
}
