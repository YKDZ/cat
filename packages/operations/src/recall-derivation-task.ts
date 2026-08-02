import {
  createRecallDerivationTask,
  executeCommand,
  projectRecallDerivationTasks,
  type DbHandle,
  type LocalizationTaskSummary,
} from "@cat/domain";
import {
  RecallDerivationReferenceSchema,
  TaskAffectedResourceSchema,
  type RecallDerivationReference,
} from "@cat/shared";
import * as z from "zod";

export const StartRecallDerivationTaskInputSchema = z.strictObject({
  projectId: z.uuidv4(),
  actorId: z.uuidv4(),
  references: z.array(RecallDerivationReferenceSchema).min(1),
  resources: z.array(TaskAffectedResourceSchema).default([]),
});

export type StartRecallDerivationTaskInput = z.input<
  typeof StartRecallDerivationTaskInputSchema
>;

/** Starts a user-visible aggregate without taking ownership of derivation work. */
export const startRecallDerivationTask = async (
  db: DbHandle,
  input: StartRecallDerivationTaskInput,
): Promise<LocalizationTaskSummary> => {
  const command = StartRecallDerivationTaskInputSchema.parse(input);
  return await executeCommand({ db }, createRecallDerivationTask, {
    references: command.references satisfies RecallDerivationReference[],
    scope: { type: "PROJECT", id: command.projectId },
    actor: { type: "USER", id: command.actorId },
    resources: [
      { type: "PROJECT", id: command.projectId },
      ...command.resources,
    ],
  });
};

/** Refreshes the aggregate from authoritative derivation state. */
export const refreshRecallDerivationTask = async (
  db: DbHandle,
  taskId: string,
): Promise<LocalizationTaskSummary | null> => {
  const [projected] = await executeCommand(
    { db },
    projectRecallDerivationTasks,
    { taskIds: [taskId] },
  );
  return projected ?? null;
};
