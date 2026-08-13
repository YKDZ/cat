import {
  deleteGlossaryConcept,
  executeCommand,
  executeQuery,
  getGlossaryConceptMaterialization,
  listGlossaryProjectIds,
  materializeGlossaryConcept,
} from "@cat/domain";
import {
  GlossaryConceptMaterializationSchema,
  type GlossaryConceptMaterialization,
  type JSONType,
} from "@cat/shared";

import type {
  ApplicationContext,
  ApplicationMethod,
  ApplicationResult,
  ChangesetEntry,
  DependencyStatus,
} from "../application-method.ts";

const failed = (action: string, message: string): ApplicationResult => ({
  status: "FAILED",
  errorMessage: `term_concept ${action} ${message}`,
});

const parsePayload = (
  value: JSONType,
): GlossaryConceptMaterialization | null => {
  const parsed = GlossaryConceptMaterializationSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

const matchesEntry = (
  payload: GlossaryConceptMaterialization,
  entry: ChangesetEntry,
): boolean => String(payload.concept.id) === entry.entityId;

const isProjectGlossary = async (
  glossaryId: string,
  ctx: ApplicationContext,
): Promise<boolean> => {
  if (!ctx.db) return false;
  const projectIds = await executeQuery(
    { db: ctx.db },
    listGlossaryProjectIds,
    {
      glossaryId,
    },
  );
  return projectIds.includes(ctx.projectId);
};

/**
 * Applies Glossary aggregate snapshots through domain commands. Canonical
 * materialization owns recall demand registration, so VCS has no async work.
 */
export class GlossaryConceptApplicationMethod implements ApplicationMethod {
  readonly entityType = "term_concept";
  readonly asyncDependencySpec = null;

  async applyCreate(
    entry: ChangesetEntry,
    ctx: ApplicationContext,
  ): Promise<ApplicationResult> {
    return await this.materialize("CREATE", entry, entry.after, ctx);
  }

  async applyUpdate(
    entry: ChangesetEntry,
    ctx: ApplicationContext,
  ): Promise<ApplicationResult> {
    return await this.materialize("UPDATE", entry, entry.after, ctx);
  }

  async applyDelete(
    entry: ChangesetEntry,
    ctx: ApplicationContext,
  ): Promise<ApplicationResult> {
    if (!ctx.db) return failed("DELETE", "requires db in ApplicationContext.");
    const payload = parsePayload(entry.before);
    if (!payload || !matchesEntry(payload, entry)) {
      return failed(
        "DELETE",
        "requires an entity-matching aggregate snapshot.",
      );
    }
    await executeCommand(
      {
        db: ctx.db,
        ...(ctx.collector === undefined ? {} : { collector: ctx.collector }),
      },
      deleteGlossaryConcept,
      {
        conceptId: payload.concept.id,
        projectId: ctx.projectId,
        expectedBefore: payload,
      },
    );
    return { status: "APPLIED" };
  }

  async applyRollback(
    entry: ChangesetEntry,
    ctx: ApplicationContext,
  ): Promise<ApplicationResult> {
    if (entry.action === "CREATE") {
      return await this.applyDelete(
        { ...entry, action: "DELETE", before: entry.after },
        ctx,
      );
    }
    return await this.materialize("ROLLBACK", entry, entry.before, ctx);
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
    const states = new Map<string, JSONType>();
    for (const entityId of entityIds) {
      const conceptId = Number(entityId);
      if (!Number.isSafeInteger(conceptId) || conceptId <= 0) continue;
      const snapshot = await executeQuery(
        { db: ctx.db },
        getGlossaryConceptMaterialization,
        { conceptId },
      );
      if (
        snapshot !== null &&
        (await isProjectGlossary(snapshot.concept.glossaryId, ctx))
      ) {
        states.set(entityId, snapshot);
      }
    }
    return states;
  }

  private async materialize(
    action: string,
    entry: ChangesetEntry,
    value: JSONType,
    ctx: ApplicationContext,
  ): Promise<ApplicationResult> {
    if (!ctx.db) return failed(action, "requires db in ApplicationContext.");
    const payload = parsePayload(value);
    if (!payload || !matchesEntry(payload, entry)) {
      return failed(action, "requires an entity-matching aggregate snapshot.");
    }
    if (action === "CREATE") {
      const existing = await executeQuery(
        { db: ctx.db },
        getGlossaryConceptMaterialization,
        { conceptId: payload.concept.id },
      );
      if (JSON.stringify(existing) === JSON.stringify(payload)) {
        return { status: "APPLIED" };
      }
    }
    await executeCommand(
      {
        db: ctx.db,
        ...(ctx.collector === undefined ? {} : { collector: ctx.collector }),
      },
      materializeGlossaryConcept,
      {
        ...payload,
        projectId: ctx.projectId,
        expectedBefore: action === "CREATE" ? null : parsePayload(entry.before),
      },
    );
    return { status: "APPLIED" };
  }
}
