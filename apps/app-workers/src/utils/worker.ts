import { logger } from "@cat/shared/utils";
import type {
  InferSchema,
  WorkerContext,
  WorkerDefinition,
  WorkerRegistry,
} from "@/core";
import type { ZodType } from "zod/v4";
import autoTranslate from "@/workers/autoTranslate";
import batchDiffElements from "@/workers/batchDiffElements";
import createTranslation from "@/workers/createTranslation";
import exportTranslatedFile from "@/workers/exportTranslatedFile";
import insertTerms from "@/workers/insertTerms";
import upsertDocumentElementsFromFile from "@/workers/upsertDocumentElementsFromFile";

export async function initializeWorkers(
  registry: WorkerRegistry,
): Promise<WorkerRegistry> {
  registry.registerModules([
    autoTranslate,
    batchDiffElements,
    createTranslation,
    exportTranslatedFile,
    insertTerms,
    upsertDocumentElementsFromFile,
  ]);

  await registry.startAll();

  logger.info("PROCESSOR", {
    msg: "All workers initialized and started",
    workers: registry.getRunningWorkers(),
  });

  const shutdown = async () => {
    logger.info("PROCESSOR", {
      msg: "Shutting down workers...",
    });

    await registry.shutdown();

    logger.info("PROCESSOR", {
      msg: "All workers shutdown",
    });

    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());

  return registry;
}

export function defineWorker<
  TInputSchema extends ZodType,
  TOutputSchema extends ZodType | undefined = undefined,
  TContext extends WorkerContext<InferSchema<TInputSchema>> = WorkerContext<
    InferSchema<TInputSchema>
  >,
>(
  config: WorkerDefinition<TInputSchema, TOutputSchema, TContext>,
): WorkerDefinition<TInputSchema, TOutputSchema, TContext> {
  return config;
}
