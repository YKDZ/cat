import {
  createMemoryItems,
  deleteMemoryItem,
  executeCommand,
  executeQuery,
  getMemoryAccessContext,
  getMemoryCanonicalSnapshots,
} from "@cat/domain";
import type { JSONType } from "@cat/shared";
import * as z from "zod";

import type {
  ApplicationContext,
  ApplicationMethod,
  ApplicationResult,
  ChangesetEntry,
  DependencyStatus,
} from "../application-method.ts";

const MemoryItemWritePayloadSchema = z.strictObject({
  memoryItemId: z.int().positive().optional(),
  memoryId: z.uuidv4(),
  translationId: z.int().positive().nullable(),
  translationStringId: z.int().positive(),
  sourceStringId: z.int().positive(),
  creatorId: z.uuidv4().nullable(),
});

const MemoryItemDeletionPayloadSchema = MemoryItemWritePayloadSchema.extend({
  memoryItemId: z.int().positive(),
  deletedById: z.uuidv4().nullable(),
  scope: z.enum(["PROJECT", "PERSONAL"]),
  projectId: z.uuidv4().nullable(),
  reason: z.string().optional(),
});

type MemoryItemWritePayload = z.infer<typeof MemoryItemWritePayloadSchema>;
type IdentifiedMemoryItemWritePayload = MemoryItemWritePayload & {
  memoryItemId: number;
};
type MemoryItemApplicationPayload = MemoryItemWritePayload & {
  memoryItemId: number;
  deletedById: string | null;
  scope: "PROJECT" | "PERSONAL";
  projectId: string | null;
};

const failed = (action: string, message: string): ApplicationResult => ({
  status: "FAILED",
  errorMessage: `memory_item ${action} ${message}`,
});

const MemoryItemEntityIdSchema = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.int().positive());

const toCreateCommand = (payload: IdentifiedMemoryItemWritePayload) => ({
  memoryId: payload.memoryId,
  items: [
    {
      memoryItemId: payload.memoryItemId,
      translationId: payload.translationId,
      translationStringId: payload.translationStringId,
      sourceStringId: payload.sourceStringId,
      creatorId: payload.creatorId,
    },
  ],
});

const parseWritePayload = (value: JSONType): MemoryItemWritePayload | null => {
  const direct = MemoryItemWritePayloadSchema.safeParse(value);
  if (direct.success) return direct.data;
  const deletion = MemoryItemDeletionPayloadSchema.safeParse(value);
  if (!deletion.success) return null;
  return {
    memoryItemId: deletion.data.memoryItemId,
    memoryId: deletion.data.memoryId,
    translationId: deletion.data.translationId,
    translationStringId: deletion.data.translationStringId,
    sourceStringId: deletion.data.sourceStringId,
    creatorId: deletion.data.creatorId,
  };
};

const matchesEntityId = (
  payload: MemoryItemWritePayload,
  entry: ChangesetEntry,
): boolean =>
  payload.memoryItemId === undefined ||
  String(payload.memoryItemId) === entry.entityId;

const getAuthorizedMemoryAccess = async (
  memoryId: string,
  ctx: ApplicationContext,
) => {
  const access = await executeQuery({ db: ctx.db! }, getMemoryAccessContext, {
    memoryId,
  });
  if (!access) return null;
  const authorized =
    access.scope === "PROJECT" && access.projectIds.includes(ctx.projectId);
  return authorized ? access : null;
};

const matchesAppliedIdentity = (
  result: unknown,
  payload: IdentifiedMemoryItemWritePayload,
): boolean => {
  if (typeof result !== "object" || result === null || !("items" in result)) {
    return false;
  }
  const items = result.items;
  if (!Array.isArray(items) || items.length !== 1) return false;
  const [item] = items;
  return (
    typeof item === "object" &&
    item !== null &&
    Reflect.get(item, "id") === payload.memoryItemId &&
    Reflect.get(item, "memoryId") === payload.memoryId &&
    Reflect.get(item, "translationId") === payload.translationId
  );
};

const resolveDeletionPayload = async (
  value: JSONType,
  entry: ChangesetEntry,
  ctx: ApplicationContext,
) => {
  const deletion = MemoryItemDeletionPayloadSchema.safeParse(value);
  const write = deletion.success ? deletion.data : parseWritePayload(value);
  if (
    !write ||
    write.memoryItemId === undefined ||
    !matchesEntityId(write, entry)
  ) {
    return null;
  }
  const [snapshot] = await executeQuery(
    { db: ctx.db! },
    getMemoryCanonicalSnapshots,
    { memoryItemIds: [write.memoryItemId] },
  );
  if (!snapshot || snapshot.memoryId !== write.memoryId) return null;
  const access = await getAuthorizedMemoryAccess(write.memoryId, ctx);
  if (!access) return null;
  return {
    ...write,
    memoryItemId: write.memoryItemId,
    deletedById: deletion.success ? deletion.data.deletedById : null,
    scope: access.scope,
    projectId:
      access.scope === "PROJECT" ? ctx.projectId : access.personalProjectId,
    ...(deletion.success && deletion.data.reason
      ? { reason: deletion.data.reason }
      : {}),
  };
};

const toApplicationPayload = (input: {
  id: number;
  memoryId: string;
  translationId: number | null;
  source: { id: number };
  translation: { id: number };
  creatorId: string | null;
  scope: "PROJECT" | "PERSONAL";
  projectId: string | null;
}): MemoryItemApplicationPayload => ({
  memoryItemId: input.id,
  memoryId: input.memoryId,
  translationId: input.translationId,
  translationStringId: input.translation.id,
  sourceStringId: input.source.id,
  creatorId: input.creatorId,
  deletedById: null,
  scope: input.scope,
  projectId: input.projectId,
});

/**
 * Materializes governed Memory Item writes. Recall derivation demand is owned
 * by the canonical Memory commands, so this method has no VCS async dependency.
 */
export class MemoryItemApplicationMethod implements ApplicationMethod {
  readonly entityType = "memory_item";
  readonly asyncDependencySpec = null;

  async applyCreate(
    entry: ChangesetEntry,
    ctx: ApplicationContext,
  ): Promise<ApplicationResult> {
    if (!ctx.db) return failed("CREATE", "requires db in ApplicationContext.");
    const parsed = parseWritePayload(entry.after);
    const entityId = MemoryItemEntityIdSchema.safeParse(entry.entityId);
    if (
      !parsed ||
      !entityId.success ||
      (parsed.memoryItemId !== undefined &&
        parsed.memoryItemId !== entityId.data) ||
      !(await getAuthorizedMemoryAccess(parsed.memoryId, ctx))
    ) {
      return failed("CREATE", "requires an entity-matching canonical payload.");
    }
    const identified = { ...parsed, memoryItemId: entityId.data };
    const result = await executeCommand(
      {
        db: ctx.db,
        ...(ctx.collector === undefined ? {} : { collector: ctx.collector }),
      },
      createMemoryItems,
      toCreateCommand(identified),
    );
    if (!matchesAppliedIdentity(result, identified)) {
      return failed("CREATE", "did not materialize the requested identity.");
    }
    return { status: "APPLIED" };
  }

  async applyUpdate(
    entry: ChangesetEntry,
    ctx: ApplicationContext,
  ): Promise<ApplicationResult> {
    if (!ctx.db) return failed("UPDATE", "requires db in ApplicationContext.");
    const parsed = parseWritePayload(entry.after);
    const before = parseWritePayload(entry.before);
    if (
      !parsed ||
      parsed.memoryItemId === undefined ||
      !matchesEntityId(parsed, entry) ||
      !(await getAuthorizedMemoryAccess(parsed.memoryId, ctx)) ||
      (before !== null &&
        (before.memoryId !== parsed.memoryId ||
          before.translationId !== parsed.translationId))
    ) {
      return failed(
        "UPDATE",
        "requires an entity-matching payload with immutable memory and translation identities.",
      );
    }

    const identified = { ...parsed, memoryItemId: parsed.memoryItemId };
    const result = await executeCommand(
      {
        db: ctx.db,
        ...(ctx.collector === undefined ? {} : { collector: ctx.collector }),
      },
      createMemoryItems,
      toCreateCommand(identified),
    );
    if (!matchesAppliedIdentity(result, identified)) {
      return failed("UPDATE", "did not materialize the requested identity.");
    }
    return { status: "APPLIED" };
  }

  async applyDelete(
    entry: ChangesetEntry,
    ctx: ApplicationContext,
  ): Promise<ApplicationResult> {
    if (!ctx.db) return failed("DELETE", "requires db in ApplicationContext.");
    const parsed = await resolveDeletionPayload(entry.before, entry, ctx);
    if (!parsed) return failed("DELETE", "requires a canonical payload.");

    await executeCommand(
      {
        db: ctx.db,
        ...(ctx.collector === undefined ? {} : { collector: ctx.collector }),
      },
      deleteMemoryItem,
      {
        memoryItemId: parsed.memoryItemId,
        deletedById: parsed.deletedById,
        scope: parsed.scope,
        projectId: parsed.projectId,
        reason: parsed.reason,
      },
    );
    return { status: "APPLIED" };
  }

  async applyRollback(
    entry: ChangesetEntry,
    ctx: ApplicationContext,
  ): Promise<ApplicationResult> {
    if (entry.action === "DELETE") {
      return await this.applyCreate({ ...entry, after: entry.before }, ctx);
    }
    if (entry.action === "UPDATE") {
      return await this.applyUpdate({ ...entry, after: entry.before }, ctx);
    }
    return await this.applyDelete({ ...entry, before: entry.after }, ctx);
  }

  async validateDependencies(_entityId: string): Promise<DependencyStatus> {
    return { status: "READY" };
  }

  async compensate(
    _entry: ChangesetEntry,
    _ctx: ApplicationContext,
  ): Promise<void> {}

  async fetchCurrentState(
    entityId: string,
    ctx: ApplicationContext,
  ): Promise<JSONType | null> {
    const states = await this.fetchCurrentStates([entityId], ctx);
    return states.get(entityId) ?? null;
  }

  async fetchCurrentStates(
    entityIds: string[],
    ctx: ApplicationContext,
  ): Promise<Map<string, JSONType>> {
    if (!ctx.db) return new Map();
    const ids = entityIds.flatMap((entityId) => {
      const id = Number(entityId);
      return Number.isSafeInteger(id) && id > 0 ? [id] : [];
    });
    if (ids.length === 0) return new Map();

    const snapshots = await executeQuery(
      { db: ctx.db },
      getMemoryCanonicalSnapshots,
      { memoryItemIds: ids },
    );
    const values = await Promise.all(
      snapshots.map(async (snapshot) => {
        const access = await getAuthorizedMemoryAccess(snapshot.memoryId, ctx);
        if (!access) return null;
        const projectId =
          access.scope === "PROJECT" ? ctx.projectId : access.personalProjectId;
        return [
          String(snapshot.id),
          toApplicationPayload({ ...snapshot, scope: access.scope, projectId }),
        ] as const;
      }),
    );
    return new Map(
      values.filter(
        (value): value is readonly [string, MemoryItemApplicationPayload] =>
          value !== null,
      ),
    );
  }
}
