import { autoTranslateQueue } from "@/workers/autoTranslate.ts";
import { batchDiffElementsQueue } from "@/workers/batchDiffElements.ts";
import { createTranslationQueue } from "@/workers/createTranslation.ts";
import { exportTranslatedFileQueue } from "@/workers/exportTranslatedFile.ts";
import { updateTranslationQueue } from "@/workers/updateTranslation.ts";
import { upsertDocumentElementsFromFileQueue } from "@/workers/upsertDocumentElementsFromFile.ts";

const queues = [
  autoTranslateQueue,
  batchDiffElementsQueue,
  createTranslationQueue,
  exportTranslatedFileQueue,
  updateTranslationQueue,
  upsertDocumentElementsFromFileQueue,
];

export const closeAllProcessors = async (): Promise<void> => {
  await Promise.all(queues.map(async (queue) => queue.close()));
};

export const resumeAllProcessors = async (): Promise<void> => {
  await Promise.all(queues.map(async (queue) => queue.resume()));
};
