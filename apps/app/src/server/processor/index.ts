import type { Queue } from "bullmq";
import { documentFromFilePretreatmentQueue } from "./documentFromFilePretreatment";
import { exportTranslatedFileQueue } from "./exportTranslatedFile";
import { autoTranslateQueue } from "./autoTranslate";
import { importPluginQueue } from "./importPlugin";
import { cleanDanglingFilesQueue } from "./cleanDanglingFiles";

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
