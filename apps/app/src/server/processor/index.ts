import type { Queue } from "bullmq";
import { autoTranslateQueue } from "./autoTranslate.ts";
import { documentFromFilePretreatmentQueue } from "./documentFromFilePretreatment.ts";
import { exportTranslatedFileQueue } from "./exportTranslatedFile.ts";
import { createTranslationQueue } from "./createTranslation.ts";
import { updateTranslationQueue } from "./updateTranslation.ts";

const queues: Queue[] = [
  documentFromFilePretreatmentQueue,
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
