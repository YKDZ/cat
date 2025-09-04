import type { Queue } from "bullmq";
import { autoTranslateQueue } from "./autoTranslate";
import { documentFromFilePretreatmentQueue } from "./documentFromFilePretreatment";
import { exportTranslatedFileQueue } from "./exportTranslatedFile";
import { importPluginQueue } from "./importPlugin";
import { createTranslationQueue } from "./createTranslation";
import { updateTranslationQueue } from "./updateTranslation";

const queues: Queue[] = [
  documentFromFilePretreatmentQueue,
  importPluginQueue,
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
