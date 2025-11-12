import { logger } from "@cat/shared/utils";
import { WorkerRegistry } from "../core/registry.ts";

declare global {
  // oxlint-disable-next-line no-var
  var __WORKER_REGISTRY__: WorkerRegistry | undefined;
}

export const getWorkerRegistry = async (): Promise<WorkerRegistry> => {
  if (!globalThis["__WORKER_REGISTRY__"]) {
    logger.debug("DB", { msg: "new DrizzleDB instance" });
    const db = new WorkerRegistry();
    globalThis["__WORKER_REGISTRY__"] = db;
  }
  return globalThis["__WORKER_REGISTRY__"];
};
