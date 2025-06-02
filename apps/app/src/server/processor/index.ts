import { documentFromFilePretreatmentQueue } from "./documentFromFilePretreatment";
import { importPluginQueue } from "./importPlugin";

const queues = [documentFromFilePretreatmentQueue, importPluginQueue];

export const pauseAllProcessors = async () => {
  await Promise.all(queues.map((queue) => queue.pause()));
};

export const resumeAllProcessors = async () => {
  await Promise.all(queues.map((queue) => queue.resume()));
};

export const closeAllProcessors = async () => {
  await Promise.all(queues.map((queue) => queue.close()));
};
