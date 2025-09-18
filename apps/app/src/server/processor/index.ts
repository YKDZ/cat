import type { Queue } from "bullmq";
import { autoTranslateQueue } from "./autoTranslate.ts";
import { exportTranslatedFileQueue } from "./exportTranslatedFile.ts";
import { createTranslationQueue } from "./createTranslation.ts";
import { updateTranslationQueue } from "./updateTranslation.ts";
import { upsertDocumentElementsFromFileQueue } from "@/server/processor/upsertDocumentElementsFromFile.ts";
import { batchDiffElementsQueue } from "@/server/processor/batchDiffElements.ts";

const queues: Queue[] = [
  batchDiffElementsQueue,
  upsertDocumentElementsFromFileQueue,
  exportTranslatedFileQueue,
  autoTranslateQueue,
  createTranslationQueue,
  updateTranslationQueue,
];

export const pauseAllProcessors = async () => {
  await Promise.all(queues.map((queue) => queue.pause()));
};

export const resumeAllProcessors = async () => {
  await Promise.all(queues.map((queue) => queue.resume()));
};

export const closeAllProcessors = async () => {
  await Promise.all(queues.map((queue) => queue.close()));
};
