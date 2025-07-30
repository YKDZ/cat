import type { Queue } from "bullmq";
import { autoTranslateQueue } from "./autoTranslate";
import { cleanDanglingFilesQueue } from "./cleanDanglingFiles";
import { documentFromFilePretreatmentQueue } from "./documentFromFilePretreatment";
import { exportTranslatedFileQueue } from "./exportTranslatedFile";
import { importPluginQueue } from "./importPlugin";

const queues: Queue[] = [
  documentFromFilePretreatmentQueue,
  importPluginQueue,
  exportTranslatedFileQueue,
  autoTranslateQueue,
  cleanDanglingFilesQueue,
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
