import type { DrizzleClient } from "@cat/db";
import { logger } from "@cat/shared/utils";
import { insertTermsWorker } from "@/workers/insertTerms.ts";
import { autoTranslateFinalizeWorker } from "@/workers/autoTranslate.ts";
import { batchDiffElementsFinalizeWorker } from "@/workers/batchDiffElements.ts";
import { createTranslationWorker } from "@/workers/createTranslation.ts";
import { exportTranslatedFileWorker } from "@/workers/exportTranslatedFile.ts";
import { upsertDocumentElementsFinalizeWorker } from "@/workers/upsertDocumentElementsFromFile.ts";
import type {
  InferSchema,
  WorkerContext,
  WorkerDefinition,
  WorkerRegistry,
} from "@/core";
import type { ZodType } from "zod/v4";

export async function initializeWorkers(
  registry: WorkerRegistry,
  drizzle: DrizzleClient,
): Promise<WorkerRegistry> {
  registry.register(autoTranslateFinalizeWorker);
  registry.register(batchDiffElementsFinalizeWorker);
  registry.register(createTranslationWorker);
  registry.register(exportTranslatedFileWorker);
  registry.register(insertTermsWorker);
  registry.register(upsertDocumentElementsFinalizeWorker);

  await registry.startAll(drizzle);

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
      msg: "All workers shut down",
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
