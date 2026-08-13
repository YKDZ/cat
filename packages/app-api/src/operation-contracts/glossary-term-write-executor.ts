import {
  createGlossaryTerms,
  createInProcessCollector,
  createRecallDerivationTask,
  domainEventBus,
  executeCommand,
  executeQuery,
  findGlossaryConceptMaterializationByDefinition,
  reserveGlossaryEntityIds,
  type DbHandle,
  type EventCollector,
} from "@cat/domain";
import {
  GlossaryConceptMaterializationSchema,
  type GlossaryTermWriteOperation,
  type RecallDerivationReference,
  TermDataSchema,
} from "@cat/shared";
import {
  appendBranchChangesWithRetry,
  createVCSRouteHelper,
  type VCSContext,
} from "@cat/vcs";
import * as z from "zod";

export type AuthorizedGlossaryTermWrite = {
  glossaryId: string;
  termsData: z.infer<typeof TermDataSchema>[];
  operation: GlossaryTermWriteOperation;
  write:
    | {
        mode: "direct";
        projectId?: string | undefined;
      }
    | {
        mode: "branch";
        projectId: string;
        branchId: number;
        branchChangesetId: number;
      };
};

export type AuthorizedGlossaryTermWriteContext = {
  db: DbHandle;
  actorId: string;
  /** A caller-provided collector is flushed by the caller after its transaction commits. */
  collector?: EventCollector | undefined;
};

export type AuthorizedGlossaryTermWriteResult = {
  derivations: RecallDerivationReference[];
  recallDerivationTaskId?: string | undefined;
};

const glossaryDefinitionKey = (
  definition: string | null | undefined,
): string | null =>
  typeof definition === "string" && definition.length > 0 ? definition : null;

const collectGlossaryTermGroups = (
  termsData: z.infer<typeof TermDataSchema>[],
) => {
  const groups = new Map<
    string,
    {
      definition: string | null;
      terms: Array<z.infer<typeof TermDataSchema>>;
      subjects: Map<number, boolean>;
    }
  >();
  for (const [index, item] of termsData.entries()) {
    const definition = glossaryDefinitionKey(item.definition);
    const key =
      definition === null ? `anonymous:${index}` : `definition:${definition}`;
    const group = groups.get(key) ?? {
      definition,
      terms: [],
      subjects: new Map<number, boolean>(),
    };
    group.terms.push(item);
    item.subjectIds?.forEach((subjectId, subjectIndex) => {
      if (!group.subjects.has(subjectId)) {
        group.subjects.set(subjectId, subjectIndex === 0);
      }
    });
    groups.set(key, group);
  }
  return [...groups.values()];
};

const buildGlossaryBranchChanges = async (input: {
  db: DbHandle;
  glossaryId: string;
  actorId: string;
  termsData: z.infer<typeof TermDataSchema>[];
  branchEntries: Array<{
    id: number;
    entityType: string;
    entityId: string;
    after: unknown;
  }>;
}) => {
  const groups = collectGlossaryTermGroups(input.termsData);
  const branchSnapshots = [...input.branchEntries]
    .filter((entry) => entry.entityType === "term_concept")
    .sort((left, right) => right.id - left.id)
    .reduce<{ states: unknown[]; seen: Set<string> }>(
      (acc, entry) => {
        if (entry.after !== null && !acc.seen.has(entry.entityId)) {
          acc.states.push(entry.after);
        }
        acc.seen.add(entry.entityId);
        return acc;
      },
      { states: [], seen: new Set<string>() },
    )
    .states.flatMap((snapshot) => {
      const parsed = GlossaryConceptMaterializationSchema.safeParse(snapshot);
      return parsed.success ? [parsed.data] : [];
    });
  const previous = await Promise.all(
    groups.map(async (group) =>
      group.definition === null
        ? null
        : (branchSnapshots.find(
            (snapshot) =>
              snapshot.concept.glossaryId === input.glossaryId &&
              snapshot.concept.definition === group.definition,
          ) ??
          (await executeQuery(
            { db: input.db },
            findGlossaryConceptMaterializationByDefinition,
            { glossaryId: input.glossaryId, definition: group.definition },
          ))),
    ),
  );
  const reserved = await executeCommand(
    { db: input.db },
    reserveGlossaryEntityIds,
    {
      conceptCount: previous.filter((snapshot) => snapshot === null).length,
      termCount: input.termsData.length * 2,
    },
  );
  let nextConceptId = 0;
  let nextTermId = 0;
  return groups.map((group, index) => {
    const before = previous[index] ?? null;
    const conceptId =
      before?.concept.id ?? reserved.conceptIds[nextConceptId++];
    if (conceptId === undefined) {
      throw new Error("Glossary concept ID reservation was incomplete.");
    }
    const terms = group.terms.flatMap((item) => {
      const sourceTermId = reserved.termIds[nextTermId++];
      const targetTermId = reserved.termIds[nextTermId++];
      if (sourceTermId === undefined || targetTermId === undefined) {
        throw new Error("Glossary term ID reservation was incomplete.");
      }
      return [
        {
          id: sourceTermId,
          termConceptId: conceptId,
          creatorId: input.actorId,
          text: item.term,
          languageId: item.termLanguageId,
          type: "NOT_SPECIFIED" as const,
          status: "NOT_SPECIFIED" as const,
        },
        {
          id: targetTermId,
          termConceptId: conceptId,
          creatorId: input.actorId,
          text: item.translation,
          languageId: item.translationLanguageId,
          type: "NOT_SPECIFIED" as const,
          status: "NOT_SPECIFIED" as const,
        },
      ];
    });
    const subjects = new Map<number, boolean>(
      before?.subjects.map((subject) => [
        subject.subjectId,
        subject.isPrimary,
      ]) ?? [],
    );
    for (const [subjectId, isPrimary] of group.subjects) {
      if (!subjects.has(subjectId)) subjects.set(subjectId, isPrimary);
    }
    const after = GlossaryConceptMaterializationSchema.parse({
      concept: {
        id: conceptId,
        glossaryId: input.glossaryId,
        creatorId: before?.concept.creatorId ?? null,
        definition: before?.concept.definition ?? group.definition,
      },
      terms: [...(before?.terms ?? []), ...terms],
      subjects: [...subjects.entries()].map(([subjectId, isPrimary]) => ({
        subjectId,
        isPrimary,
      })),
    });
    return {
      entityType: "term_concept" as const,
      entityId: String(conceptId),
      action: before === null ? ("CREATE" as const) : ("UPDATE" as const),
      before,
      after,
      fieldPath: null,
      riskLevel: "MEDIUM" as const,
    };
  });
};

const executeDirectProjectWrite = async (
  context: AuthorizedGlossaryTermWriteContext,
  input: AuthorizedGlossaryTermWrite & {
    write: { mode: "direct"; projectId: string };
  },
): Promise<AuthorizedGlossaryTermWriteResult> => {
  const collector =
    context.collector ?? createInProcessCollector(domainEventBus);
  const derivations: RecallDerivationReference[] = [];
  let recallDerivationTaskId: string | undefined;
  const vcsContext = {
    mode: "direct",
    projectId: input.write.projectId,
    createdBy: context.actorId,
  } satisfies VCSContext;
  await context.db.transaction(async (tx) => {
    const { middleware } = createVCSRouteHelper(tx);
    for (const group of collectGlossaryTermGroups(input.termsData)) {
      const created = await middleware.interceptMutationWrite(
        vcsContext,
        "term_concept",
        async () => {
          const created = await executeCommand(
            { db: tx, collector },
            createGlossaryTerms,
            {
              glossaryId: input.glossaryId,
              projectId: input.write.projectId,
              creatorId: context.actorId,
              data: group.terms,
            },
          );
          const mutation = created.mutations[0];
          if (mutation === undefined || created.mutations.length !== 1) {
            throw new Error(
              "Glossary import did not resolve exactly one concept.",
            );
          }
          return {
            entityId: String(mutation.after.concept.id),
            action: mutation.action,
            before: mutation.before,
            after: mutation.after,
            result: created,
          };
        },
      );
      derivations.push(...created.derivations);
    }
    if (input.operation === "BULK_IMPORT" && derivations.length > 0) {
      const task = await executeCommand(
        { db: tx },
        createRecallDerivationTask,
        {
          references: derivations,
          scope: { type: "PROJECT", id: input.write.projectId },
          actor: { type: "USER", id: context.actorId },
          resources: [
            { type: "PROJECT", id: input.write.projectId },
            { type: "GLOSSARY", id: input.glossaryId },
          ],
        },
      );
      recallDerivationTaskId = task.id;
    }
  });
  if (context.collector === undefined) {
    await collector.flush();
  }
  return {
    derivations,
    ...(recallDerivationTaskId === undefined ? {} : { recallDerivationTaskId }),
  };
};

/**
 * Executes a glossary write after a contract has resolved authorization, write
 * mode, project binding, and branch changeset ownership.
 */
export const executeAuthorizedGlossaryTermWrite = async (
  context: AuthorizedGlossaryTermWriteContext,
  input: AuthorizedGlossaryTermWrite,
): Promise<AuthorizedGlossaryTermWriteResult> => {
  if (input.write.mode === "branch") {
    await appendBranchChangesWithRetry({
      db: context.db,
      changesetId: input.write.branchChangesetId,
      build: async (entries) =>
        await buildGlossaryBranchChanges({
          db: context.db,
          glossaryId: input.glossaryId,
          actorId: context.actorId,
          termsData: input.termsData,
          branchEntries: entries,
        }),
    });
    return { derivations: [] };
  }
  if (input.write.projectId !== undefined) {
    return await executeDirectProjectWrite(context, {
      ...input,
      write: { mode: "direct", projectId: input.write.projectId },
    });
  }
  if (input.operation === "BULK_IMPORT") {
    throw new TypeError(
      "Bulk glossary import requires a direct project scope.",
    );
  }
  const created = await executeCommand(
    { db: context.db },
    createGlossaryTerms,
    {
      glossaryId: input.glossaryId,
      creatorId: context.actorId,
      data: input.termsData,
    },
  );
  return { derivations: created.derivations };
};
