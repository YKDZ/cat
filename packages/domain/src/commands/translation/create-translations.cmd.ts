import {
  agentExternalOutput,
  and,
  contentRelation,
  eq,
  inArray,
  translatableElement,
  translation,
} from "@cat/db";
import * as z from "zod";

import { assertActiveAgentRunOwnership } from "#/commands/agent/assert-agent-run-ownership.ts";
import { domainEvent } from "#/events/domain-events.ts";
import type { Command } from "#/types.ts";

export const CreateTranslationsCommandSchema = z.object({
  data: z.array(
    z.object({
      translatableElementId: z.int(),
      translatorId: z.uuidv4().nullable().optional(),
      stringId: z.int(),
      meta: z.json().optional(),
    }),
  ),
  ownershipFence: z
    .object({
      runId: z.uuidv4(),
      ownerId: z.uuidv4(),
      epoch: z.int().positive(),
    })
    .optional(),
  workflowOutput: z
    .object({
      nodeId: z.string().min(1),
      outputKey: z.string().min(1),
      idempotencyKey: z.string().min(1),
      payload: z.record(z.string(), z.json()).optional(),
    })
    .optional(),
});

export type CreateTranslationsCommand = z.infer<
  typeof CreateTranslationsCommandSchema
>;

export const createTranslations: Command<
  CreateTranslationsCommand,
  number[]
> = async (ctx, command) => {
  if (command.data.length === 0) {
    return {
      result: [],
      events: [],
    };
  }

  const inserted = await ctx.db.transaction(async (tx) => {
    const runInternalId = command.ownershipFence
      ? await assertActiveAgentRunOwnership(tx, command.ownershipFence)
      : null;
    if (command.workflowOutput && runInternalId === null) {
      throw new Error(
        "Workflow output idempotency requires an ownership fence.",
      );
    }
    if (command.workflowOutput && runInternalId !== null) {
      const [existing] = await tx
        .select({ payload: agentExternalOutput.payload })
        .from(agentExternalOutput)
        .where(
          and(
            eq(agentExternalOutput.runId, runInternalId),
            eq(
              agentExternalOutput.idempotencyKey,
              command.workflowOutput.idempotencyKey,
            ),
          ),
        );
      const parsed = z
        .object({ translationIds: z.array(z.int()) })
        .safeParse(existing?.payload);
      if (parsed.success) {
        return parsed.data.translationIds.map((id) => ({ id }));
      }
    }
    const created = await tx
      .insert(translation)
      .values(command.data)
      .returning({ id: translation.id });
    if (command.workflowOutput && runInternalId !== null) {
      await tx.insert(agentExternalOutput).values({
        runId: runInternalId,
        nodeId: command.workflowOutput.nodeId,
        outputType: "db_write",
        outputKey: command.workflowOutput.outputKey,
        payload: {
          translationIds: created.map((item) => item.id),
          ...(command.workflowOutput.payload ?? {}),
        },
        idempotencyKey: command.workflowOutput.idempotencyKey,
      });
    }
    return created;
  });

  const translationIds = inserted.map((item) => item.id);
  const contextRows = await ctx.db
    .select({
      translationId: translation.id,
      elementId: translatableElement.id,
      projectId: translatableElement.projectId,
      primaryContentNodeId: contentRelation.sourceNodeId,
    })
    .from(translation)
    .innerJoin(
      translatableElement,
      eq(translatableElement.id, translation.translatableElementId),
    )
    .leftJoin(
      contentRelation,
      and(
        eq(contentRelation.targetElementId, translatableElement.id),
        eq(contentRelation.targetEndpointKind, "ELEMENT"),
        eq(contentRelation.sourceEndpointKind, "NODE"),
        eq(contentRelation.isPrimary, true),
      ),
    )
    .where(inArray(translation.id, translationIds));

  const byProject = new Map<
    string,
    {
      translationIds: Set<number>;
      elementIds: Set<number>;
      primaryContentNodeIds: Set<string>;
    }
  >();

  for (const row of contextRows) {
    const bucket = byProject.get(row.projectId) ?? {
      translationIds: new Set<number>(),
      elementIds: new Set<number>(),
      primaryContentNodeIds: new Set<string>(),
    };

    bucket.translationIds.add(row.translationId);
    bucket.elementIds.add(row.elementId);
    if (row.primaryContentNodeId !== null) {
      bucket.primaryContentNodeIds.add(row.primaryContentNodeId);
    }
    byProject.set(row.projectId, bucket);
  }

  const events = [...byProject.entries()].map(([projectId, value]) =>
    domainEvent("translation:created", {
      projectId,
      translationIds: [...value.translationIds],
      elementIds: [...value.elementIds],
      primaryContentNodeIds: [...value.primaryContentNodeIds],
    }),
  );

  return {
    result: translationIds,
    events,
  };
};
