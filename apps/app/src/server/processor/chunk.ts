import { Queue, Worker } from "bullmq";
import { config } from "./config";
import z from "zod";
import { randomUUID } from "crypto";
import { logger, type JSONType } from "@cat/shared";
import { getPrismaDB, getRedisDB } from "@cat/db";

export type ChunkData<T> = {
  chunkIndex: number;
  data: T[];
};

const ChunkContextSchema = <T>() => {
  return z.object({
    chunkIndex: z.number().int(),
    data: z.array(z.custom<T>()),
  });
};

type DistributedTaskWithId<T> = DistributedTask<T> & {
  id: string;
};

export type DistributedTask<T> = {
  chunks: ChunkData<T>[];
  run(ctx: ChunkData<T>): Promise<JSONType | void>;
  rollback(ctx: ChunkData<T>, data: JSONType | undefined): Promise<void>;
};

const TaskEventSchema = z.object({
  type: z.enum(["chunk:error", "chunk:done"]),
  chunkIndex: z.int(),
  data: z.json().optional(),
  error: z.any().optional(),
});

type TaskEvent = z.infer<typeof TaskEventSchema>;

type FinishedChunkData = {
  index: number;
  data?: JSONType;
  error?: unknown;
};

export class DistributedTaskHandler<T> {
  private task: DistributedTask<T> & {
    type: string;
  };

  constructor(type: string, task: DistributedTask<T>) {
    this.task = {
      ...task,
      type,
    };
  }

  public async run() {
    const { client: prisma } = await getPrismaDB();

    const task = await prisma.task.create({
      data: {
        type: "distributed_" + this.task.type,
      },
    });

    const taskWithId = {
      id: task.id,
      ...this.task,
    } satisfies DistributedTaskWithId<T>;

    const worker = createWorker(taskWithId);
    await worker.waitUntilReady();
    await runDistributedTask(taskWithId);
    await worker.close();
  }
}

const createWorker = <T>(task: DistributedTaskWithId<T>) => {
  return new Worker(
    task.id,
    async (job) => {
      const { redisPub } = await getRedisDB();

      const chunk = ChunkContextSchema<T>()
        .extend({
          jobId: z.string(),
        })
        .parse(job.data);

      try {
        const data = await task.run(chunk);
        await redisPub.publish(
          `${chunk.jobId}:events`,
          JSON.stringify(
            TaskEventSchema.parse({
              type: "chunk:done",
              chunkIndex: chunk.chunkIndex,
              data,
            }),
          ),
        );
      } catch (err) {
        logger.error(
          "PROCESSOR",
          {
            msg: `Error when processing chunk ${chunk.chunkIndex} of task ${task.id}. Rollback will be called`,
          },
          err,
        );
        await redisPub.publish(
          `${chunk.jobId}:events`,
          JSON.stringify(
            TaskEventSchema.parse({
              type: "chunk:error",
              chunkIndex: chunk.chunkIndex,
              error: err,
            } satisfies TaskEvent),
          ),
        );
        throw err;
      }
    },
    { ...config },
  );
};

const runDistributedTask = async <T>(
  task: DistributedTaskWithId<T>,
): Promise<void> => {
  const { redisSub } = await getRedisDB();

  const queue = new Queue(task.id, { ...config });
  await queue.waitUntilReady();

  const jobId = `task:${task.id}:job:${randomUUID()}`;
  const successfulChunks: FinishedChunkData[] = [];
  const failedChunks: FinishedChunkData[] = [];

  try {
    await updateTaskStatus(task, "processing");
  } catch (error) {
    logger.error(
      "PROCESSOR",
      {
        msg: `Failed to update task status for task ${task.id}. Task will not be processed.`,
      },
      error,
    );
    return;
  }

  return new Promise((resolve, reject) => {
    void (async () => {
      await redisSub.subscribe(`${jobId}:events`, async (message) => {
        try {
          const event = TaskEventSchema.parse(JSON.parse(message));
          if (event.type === "chunk:done") {
            successfulChunks.push({
              index: event.chunkIndex,
              data: event.data,
            });
          } else if (event.type === "chunk:error") {
            failedChunks.push({ index: event.chunkIndex, data: event.data });
            logger.debug("PROCESSOR", {
              msg: `Error in chunk ${event.chunkIndex}, task will be rollback when all finished.`,
            });
          } else {
            reject(new Error("Invalid event type: " + event.type));
          }

          // 所有块全部执行完毕（无论错误与否）
          if (
            successfulChunks.length + failedChunks.length ===
            task.chunks.length
          ) {
            await redisSub.unsubscribe(`${jobId}:events`);

            // 有错误
            // 开始回溯成功的块
            // 注意一个块自身需要是原子性的
            if (failedChunks.length !== 0) {
              await rollbackAll(task, successfulChunks);
              await updateTaskStatus(task, "failed");
              reject(
                failedChunks[0].error || new Error("Unknown error in task"),
              );
            }
            // 没有错误
            // 任务完成
            else {
              await updateTaskStatus(task, "completed");
              resolve();
            }
          }
        } catch (error) {
          logger.error("PROCESSOR", { msg: `Error in task ${task.id}` }, error);
          await redisSub.unsubscribe(`${jobId}:events`).catch(() => {});
          reject(error);
        }
      });

      try {
        // 如果没有块
        // 直接完成任务
        // 避免任务永久挂起
        if (task.chunks.length === 0) {
          await redisSub.unsubscribe(`${jobId}:events`);
          await updateTaskStatus(task, "completed");
          resolve();
        }

        for (const ctx of task.chunks) {
          Object.assign(ctx, { jobId });
          await queue.add(task.id, ctx, {
            jobId: `${task.id}&${ctx.chunkIndex}`,
          });
          logger.debug("PROCESSOR", {
            msg: `Add chunk ${ctx.chunkIndex + 1}/${task.chunks.length} of task ${task.id} to queue`,
          });
        }
      } catch (error) {
        logger.error("PROCESSOR", { msg: `Error in task ${task.id}` }, error);
        await redisSub.unsubscribe(`${jobId}:events`).catch(() => {});
        await updateTaskStatus(task, "failed");
        reject(error);
      }
    })();
  });
};

const rollbackAll = async <T>(
  task: DistributedTaskWithId<T>,
  successfulChunks: FinishedChunkData[],
) => {
  logger.debug("PROCESSOR", {
    msg: `Task ${task.id} is about to be rollback`,
  });
  for (const { index, data } of successfulChunks.reverse()) {
    const ctx = task.chunks[index];
    try {
      logger.debug("PROCESSOR", { msg: `Rolling back chunk ${index}` });
      await task.rollback(ctx, data);
    } catch (err) {
      logger.error(
        "PROCESSOR",
        { msg: `Failed to rollback chunk ${index} of task ${task.id}` },
        err,
      );
    }
  }
};

const updateTaskStatus = async <T>(
  task: DistributedTaskWithId<T>,
  status: "pending" | "processing" | "completed" | "failed",
) => {
  const { client: prisma } = await getPrismaDB();

  await prisma.task.update({
    where: { id: task.id },
    data: {
      status,
    },
  });
};
