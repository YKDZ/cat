import {
  addGlossaryTermToConcept,
  assertProjectGlossaryBinding,
  appendChangesetEntriesIfUnchanged,
  countGlossaryConcepts,
  createAgentDefinition,
  createAgentSession,
  createInProcessCollector,
  createGlossary as createGlossaryCommand,
  createGlossaryTerms,
  deleteGlossaryTerm,
  domainEventBus,
  executeCommand,
  executeQuery,
  findAgentDefinitionByNameAndScope,
  findGlossaryConceptMaterializationByDefinition,
  getAgentSessionByExternalId,
  getElementWithChunkIds,
  getGlossary,
  getChangesetEntries,
  getGlossaryConceptMaterialization,
  getGlossaryTermConceptSnapshot,
  listGlossaryConceptSubjects,
  listConceptSubjectsByConceptIds,
  listOwnedGlossaries,
  listProjectContentNodes,
  listProjectGlossaryIds,
  listProjectGlossaries,
  loadAgentRunMetadata,
  reserveGlossaryEntityIds,
  updateGlossaryConcept,
} from "@cat/domain";
import type { DbHandle } from "@cat/domain";
import {
  collectTermRecallOp,
  getTermRecallCandidates,
  rerankTermRecallOp,
} from "@cat/operations";
import {
  GlossaryConceptMaterializationSchema,
  GlossarySchema,
  TermRecallStreamEventSchema,
  type TermRecallStreamEvent,
} from "@cat/shared";
import { TermStatusValues, TermTypeValues } from "@cat/shared";
import { JSONObjectSchema } from "@cat/shared";
import { RecallDerivationReferenceSchema } from "@cat/shared";
import { TermDataSchema } from "@cat/shared";
import type { VCSContext } from "@cat/vcs";
import { listOverlayStates, listWithOverlay, readWithOverlay } from "@cat/vcs";
import { termAlignmentGraph, termDiscoveryGraph } from "@cat/workflow/tasks";
import { ORPCError } from "@orpc/client";
import * as z from "zod";

import { withBranchContext } from "#/orpc/middleware/with-branch-context.ts";
import { authed, checkPermission } from "#/orpc/server.ts";
import { throwRecallOperationFailure } from "#/services/recall-operation-failure.ts";
import { getGraphRuntime } from "#/utils/graph-runtime.ts";
import {
  createVCSRouteHelper,
  ensureBranchWriteContext,
} from "#/utils/vcs-route-helper.ts";

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
  glossaryId: string;
  creatorId: string;
  termsData: z.infer<typeof TermDataSchema>[];
  db: DbHandle;
  branchId: number;
  branchEntries?: Array<{
    id: number;
    entityType: string;
    entityId: string;
    action: string;
    after: unknown;
  }>;
}) => {
  const groups = collectGlossaryTermGroups(input.termsData);
  const branchSnapshots = (
    input.branchEntries === undefined
      ? await listOverlayStates<
          z.infer<typeof GlossaryConceptMaterializationSchema>
        >(input.db, input.branchId, "term_concept")
      : [...input.branchEntries]
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
          ).states
  ).flatMap((snapshot) => {
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
          creatorId: input.creatorId,
          text: item.term,
          languageId: item.termLanguageId,
          type: "NOT_SPECIFIED" as const,
          status: "NOT_SPECIFIED" as const,
        },
        {
          id: targetTermId,
          termConceptId: conceptId,
          creatorId: input.creatorId,
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
      action: before === null ? ("CREATE" as const) : ("UPDATE" as const),
      before,
      after,
    };
  });
};

const resolveGlossaryConceptBranchState = async (input: {
  db: DbHandle;
  branchId: number;
  conceptId: number;
}) => {
  const overlay = await readWithOverlay<
    z.infer<typeof GlossaryConceptMaterializationSchema>
  >(input.db, input.branchId, "term_concept", String(input.conceptId));
  if (overlay?.action === "DELETE") return null;
  if (overlay !== null) {
    const parsed = GlossaryConceptMaterializationSchema.safeParse(overlay.data);
    return parsed.success ? parsed.data : null;
  }
  return await executeQuery(
    { db: input.db },
    getGlossaryConceptMaterialization,
    {
      conceptId: input.conceptId,
    },
  );
};

const appendGlossaryBranchChanges = async (input: {
  db: DbHandle;
  changesetId: number;
  build: (entries: Awaited<ReturnType<typeof getChangesetEntries>>) => Promise<
    Array<{
      action: "CREATE" | "UPDATE";
      before: z.infer<typeof GlossaryConceptMaterializationSchema> | null;
      after: z.infer<typeof GlossaryConceptMaterializationSchema>;
    }>
  >;
}) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const entries = await executeQuery({ db: input.db }, getChangesetEntries, {
      changesetId: input.changesetId,
    });
    const changes = await input.build(entries);
    const appended = await executeCommand(
      { db: input.db },
      appendChangesetEntriesIfUnchanged,
      {
        changesetId: input.changesetId,
        expectedLatestEntryId:
          Math.max(...entries.map((entry) => entry.id), 0) || null,
        entries: changes.map((change) => ({
          entityType: "term_concept" as const,
          entityId: String(change.after.concept.id),
          action: change.action,
          before: change.before,
          after: change.after,
          fieldPath: null,
          riskLevel: "MEDIUM" as const,
        })),
      },
    );
    if (appended.status === "APPENDED") return;
    if (appended.status === "BRANCH_NOT_ACTIVE") {
      throw new ORPCError("CONFLICT", {
        message: "The branch is no longer active.",
      });
    }
  }
  throw new ORPCError("CONFLICT", {
    message: "Glossary branch changed concurrently. Retry the write.",
  });
};

export const deleteTerm = authed
  .input(
    z.object({
      termId: z.int(),
      branchId: z.int().optional(),
      /** Project ID for Direct mode VCS audit */
      projectId: z.uuidv4().optional(),
    }),
  )
  .use(checkPermission("glossary", "editor"), (input) =>
    input.termId.toString(),
  )
  .use(withBranchContext, (i) => ({
    branchId: i.branchId,
    projectId: i.projectId,
  }))
  .output(
    z.object({
      deleted: z.boolean(),
      derivations: z.array(RecallDerivationReferenceSchema),
    }),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    if (context.branchId !== undefined && input.projectId === undefined) {
      throw new ORPCError("BAD_REQUEST", {
        message: "projectId is required when branchId is provided",
      });
    }

    if (context.branchId === undefined && input.projectId !== undefined) {
      const collector = createInProcessCollector(domainEventBus);
      const vcsCtx: VCSContext = {
        mode: "direct",
        projectId: input.projectId,
        createdBy: context.user.id,
      };
      const result = await drizzle.transaction(async (tx) => {
        const { middleware } = createVCSRouteHelper(tx);
        return await middleware.interceptMutationWrite(
          vcsCtx,
          "term_concept",
          async () => {
            const result = await executeCommand(
              { db: tx, collector },
              deleteGlossaryTerm,
              { termId: input.termId, projectId: input.projectId },
            );
            if (
              !result.deleted ||
              result.before === null ||
              result.after === null
            ) {
              return {
                mutation: null,
                result,
              };
            }
            return {
              entityId: String(result.conceptId),
              action: "UPDATE" as const,
              before: result.before,
              after: result.after,
              result,
            };
          },
        );
      });
      if (result.deleted) await collector.flush();
      return { deleted: result.deleted, derivations: result.derivations };
    }

    const branchSnapshot =
      context.branchId === undefined
        ? null
        : (
            await listOverlayStates<
              z.infer<typeof GlossaryConceptMaterializationSchema>
            >(drizzle, context.branchId, "term_concept")
          ).find((snapshot) =>
            snapshot.terms.some((term) => term.id === input.termId),
          );
    const before =
      branchSnapshot ??
      (await executeQuery({ db: drizzle }, getGlossaryTermConceptSnapshot, {
        termId: input.termId,
      }));
    if (before === null) {
      if (context.branchId !== undefined)
        return { deleted: false, derivations: [] };
      const result = await executeCommand(
        { db: drizzle },
        deleteGlossaryTerm,
        input,
      );
      return { deleted: result.deleted, derivations: result.derivations };
    }
    if (context.branchId !== undefined) {
      const branchWriteContext = await ensureBranchWriteContext({
        drizzle,
        branchId: context.branchId,
        branchChangesetId: context.branchChangesetId,
        branchProjectId: context.branchProjectId,
      });

      if (!branchWriteContext) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Invalid branch context for glossary term deletion",
        });
      }

      await executeCommand({ db: drizzle }, assertProjectGlossaryBinding, {
        glossaryId: before.concept.glossaryId,
        projectId: branchWriteContext.projectId,
      });

      await appendGlossaryBranchChanges({
        db: drizzle,
        changesetId: branchWriteContext.branchChangesetId,
        build: async () => {
          const current = await resolveGlossaryConceptBranchState({
            db: drizzle,
            branchId: context.branchId!,
            conceptId: before.concept.id,
          });
          if (current === null) throw new ORPCError("NOT_FOUND");
          return [
            {
              action: "UPDATE" as const,
              before: current,
              after: GlossaryConceptMaterializationSchema.parse({
                ...current,
                terms: current.terms.filter((term) => term.id !== input.termId),
              }),
            },
          ];
        },
      });
      return { deleted: true, derivations: [] };
    }

    const collector = createInProcessCollector(domainEventBus);
    const result = await executeCommand(
      { db: drizzle, collector },
      deleteGlossaryTerm,
      input,
    );
    if (result.deleted) await collector.flush();
    return { deleted: result.deleted, derivations: result.derivations };
  });

export const get = authed
  .input(
    z.object({
      glossaryId: z.uuidv4(),
    }),
  )
  .use(checkPermission("glossary", "viewer"), (i) => i.glossaryId)
  .output(GlossarySchema.nullable())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    return await executeQuery({ db: drizzle }, getGlossary, input);
  });

export const getUserOwned = authed
  .input(
    z.object({
      userId: z.uuidv4(),
    }),
  )
  .output(z.array(GlossarySchema))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    return await executeQuery({ db: drizzle }, listOwnedGlossaries, {
      creatorId: input.userId,
    });
  });

export const getProjectOwned = authed
  .input(
    z.object({
      projectId: z.uuidv4(),
    }),
  )
  .output(z.array(GlossarySchema))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    return await executeQuery({ db: drizzle }, listProjectGlossaries, input);
  });

export const countTerm = authed
  .input(
    z.object({
      glossaryId: z.uuidv4(),
    }),
  )
  .output(z.int())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    return await executeQuery({ db: drizzle }, countGlossaryConcepts, input);
  });

export const create = authed
  .input(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      projectIds: z.array(z.uuidv4()).optional(),
    }),
  )
  .output(GlossarySchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;
    const collector = createInProcessCollector(domainEventBus);

    const created = await drizzle.transaction(async (tx) => {
      return executeCommand({ db: tx, collector }, createGlossaryCommand, {
        ...input,
        creatorId: user.id,
      });
    });

    await collector.flush();
    return created;
  });

export const insertTerm = authed
  .input(
    z.object({
      glossaryId: z.uuidv4(),
      termsData: z.array(TermDataSchema),
      branchId: z.int().optional(),
      /** Project ID for Direct mode VCS audit */
      projectId: z.uuidv4().optional(),
    }),
  )
  .use(withBranchContext, (i) => ({
    branchId: i.branchId,
    projectId: i.projectId,
  }))
  .use(checkPermission("glossary", "editor"), (input) => input.glossaryId)
  .output(z.object({ derivations: z.array(RecallDerivationReferenceSchema) }))
  .handler(async ({ context, input }) => {
    const { user } = context;
    const { termsData, glossaryId } = input;

    if (context.branchId !== undefined && input.projectId === undefined) {
      throw new ORPCError("BAD_REQUEST", {
        message: "projectId is required when branchId is provided",
      });
    }

    if (context.branchId !== undefined) {
      const {
        drizzleDB: { client: drizzle },
      } = context;
      const branchWriteContext = await ensureBranchWriteContext({
        drizzle,
        branchId: context.branchId,
        branchChangesetId: context.branchChangesetId,
        branchProjectId: context.branchProjectId,
      });

      if (!branchWriteContext) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Invalid branch context for glossary term creation",
        });
      }

      await executeCommand({ db: drizzle }, assertProjectGlossaryBinding, {
        glossaryId,
        projectId: branchWriteContext.projectId,
      });

      await appendGlossaryBranchChanges({
        db: drizzle,
        changesetId: branchWriteContext.branchChangesetId,
        build: async (entries) =>
          await buildGlossaryBranchChanges({
            db: drizzle,
            glossaryId,
            creatorId: user.id,
            termsData,
            branchId: context.branchId!,
            branchEntries: entries,
          }),
      });
      return { derivations: [] };
    }

    if (input.projectId !== undefined) {
      const {
        drizzleDB: { client: drizzle },
      } = context;
      const collector = createInProcessCollector(domainEventBus);
      const vcsCtx: VCSContext = {
        mode: "direct",
        projectId: input.projectId,
        createdBy: user.id,
      };
      const groups = collectGlossaryTermGroups(termsData);
      const derivations: z.infer<typeof RecallDerivationReferenceSchema>[] = [];
      await drizzle.transaction(async (tx) => {
        const { middleware } = createVCSRouteHelper(tx);
        for (const group of groups) {
          const created = await middleware.interceptMutationWrite(
            vcsCtx,
            "term_concept",
            async () => {
              const created = await executeCommand(
                { db: tx, collector },
                createGlossaryTerms,
                {
                  glossaryId,
                  projectId: input.projectId,
                  creatorId: user.id,
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
      });
      await collector.flush();
      return { derivations };
    }

    const {
      drizzleDB: { client: drizzle },
    } = context;
    const created = await executeCommand({ db: drizzle }, createGlossaryTerms, {
      glossaryId,
      creatorId: user.id,
      data: termsData,
    });
    return { derivations: created.derivations };
  });

export const searchTerm = authed
  .input(
    z.object({
      projectId: z.uuidv4(),
      text: z.string(),
      termLanguageId: z.string(),
      translationLanguageId: z.string(),
      minConfidence: z.number().min(0).max(1).optional().default(0.6),
    }),
  )
  // Streams results: ILIKE matches arrive first, semantic matches follow.
  .handler(async function* ({
    context,
    input,
  }): AsyncGenerator<TermRecallStreamEvent> {
    // jsgen: generator required — no arrow-function equivalent for async generators
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const {
      text,
      termLanguageId,
      translationLanguageId,
      projectId,
      minConfidence,
    } = input;

    const glossaryIds = await executeQuery(
      { db: drizzle },
      listProjectGlossaryIds,
      { projectId },
    );

    const recallResult = await (async () => {
      try {
        return await collectTermRecallOp(
          {
            glossaryIds,
            text,
            sourceLanguageId: termLanguageId,
            translationLanguageId,
            minSemanticSimilarity: minConfidence,
          },
          {
            pluginManager: context.pluginManager,
            traceId: crypto.randomUUID(),
          },
        );
      } catch (error) {
        return await throwRecallOperationFailure({
          context,
          error,
          affectedResources: [{ type: "PROJECT", id: projectId }],
        });
      }
    })();

    for (const term of getTermRecallCandidates(recallResult)) {
      if (term.confidence < minConfidence) continue;
      yield TermRecallStreamEventSchema.parse({
        type: "CANDIDATE",
        candidate: term,
      });
    }
    yield TermRecallStreamEventSchema.parse({
      type: "COMPLETED",
      result: recallResult,
    });
  });

export const findTerm = authed
  .input(
    z.object({
      elementId: z.int(),
      translationLanguageId: z.string(),
      minConfidence: z.number().optional().default(0.6),
    }),
  )
  // This endpoint streams term suggestions to avoid blocking response while waiting for worker
  .handler(async function* ({
    context,
    input,
  }): AsyncGenerator<TermRecallStreamEvent> {
    // jsgen: generator required — no arrow-function equivalent for async generators
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { elementId, translationLanguageId, minConfidence } = input;

    const element = await executeQuery(
      { db: drizzle },
      getElementWithChunkIds,
      { elementId },
    );

    if (element === null) {
      throw new ORPCError("NOT_FOUND", {
        message: `Element with ID ${elementId} not found`,
      });
    }

    const glossaryIds = await executeQuery(
      { db: drizzle },
      listProjectGlossaryIds,
      { projectId: element.projectId },
    );

    const recallResult = await (async () => {
      try {
        return await collectTermRecallOp(
          {
            glossaryIds,
            text: element.value,
            sourceLanguageId: element.languageId,
            translationLanguageId,
            minSemanticSimilarity: minConfidence,
          },
          {
            pluginManager: context.pluginManager,
            traceId: crypto.randomUUID(),
          },
        );
      } catch (error) {
        return await throwRecallOperationFailure({
          context,
          error,
          affectedResources: [
            { type: "PROJECT", id: element.projectId },
            { type: "ELEMENT", id: String(elementId) },
          ],
        });
      }
    })();
    const recalledTerms = getTermRecallCandidates(recallResult);
    const conceptSubjects = await executeQuery(
      { db: drizzle },
      listConceptSubjectsByConceptIds,
      { conceptIds: [...new Set(recalledTerms.map((term) => term.conceptId))] },
    );
    const subjectsByConceptId = new Map<
      number,
      { name: string; defaultDefinition: string | null }[]
    >();
    for (const subject of conceptSubjects) {
      const subjects = subjectsByConceptId.get(subject.conceptId) ?? [];
      subjects.push({
        name: subject.name,
        defaultDefinition: subject.defaultDefinition,
      });
      subjectsByConceptId.set(subject.conceptId, subjects);
    }

    const reranked = await rerankTermRecallOp(
      {
        elementId,
        queryText: element.value,
        terms: recalledTerms.map((term) => ({
          ...term,
          concept: {
            subjects: subjectsByConceptId.get(term.conceptId) ?? [],
            definition: term.definition,
          },
        })),
      },
      {
        pluginManager: context.pluginManager,
        traceId: crypto.randomUUID(),
      },
    );

    for (const term of reranked) {
      if (term.confidence < minConfidence) continue;
      yield TermRecallStreamEventSchema.parse({
        type: "CANDIDATE",
        candidate: term,
      });
    }
    yield TermRecallStreamEventSchema.parse({
      type: "COMPLETED",
      result: recallResult,
    });
  });

export const updateConcept = authed
  .input(
    z.object({
      conceptId: z.int(),
      subjectIds: z.array(z.int()).optional(),
      definition: z.string().optional(),
      branchId: z.int().optional(),
      projectId: z.uuidv4().optional(),
    }),
  )
  .use(withBranchContext, (i) => ({
    branchId: i.branchId,
    projectId: i.projectId,
  }))
  .use(checkPermission("glossary", "editor"), (input) =>
    input.conceptId.toString(),
  )
  .output(
    z.object({
      updated: z.boolean(),
      derivations: z.array(RecallDerivationReferenceSchema),
    }),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    if (context.branchId !== undefined) {
      if (input.projectId === undefined) {
        throw new ORPCError("BAD_REQUEST", {
          message: "projectId is required when branchId is provided",
        });
      }
      const branchWriteContext = await ensureBranchWriteContext({
        drizzle,
        branchId: context.branchId,
        branchChangesetId: context.branchChangesetId,
        branchProjectId: context.branchProjectId,
      });
      if (!branchWriteContext) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Invalid branch context for glossary concept update",
        });
      }
      const branchConcept = await resolveGlossaryConceptBranchState({
        db: drizzle,
        branchId: context.branchId,
        conceptId: input.conceptId,
      });
      if (branchConcept === null) throw new ORPCError("NOT_FOUND");
      await executeCommand({ db: drizzle }, assertProjectGlossaryBinding, {
        glossaryId: branchConcept.concept.glossaryId,
        projectId: branchWriteContext.projectId,
      });
      await appendGlossaryBranchChanges({
        db: drizzle,
        changesetId: branchWriteContext.branchChangesetId,
        build: async () => {
          const before = await resolveGlossaryConceptBranchState({
            db: drizzle,
            branchId: context.branchId!,
            conceptId: input.conceptId,
          });
          if (before === null) throw new ORPCError("NOT_FOUND");
          return [
            {
              action: "UPDATE" as const,
              before,
              after: GlossaryConceptMaterializationSchema.parse({
                ...before,
                concept: {
                  ...before.concept,
                  definition:
                    input.definition === undefined
                      ? before.concept.definition
                      : input.definition || "",
                },
                subjects:
                  input.subjectIds === undefined
                    ? before.subjects
                    : input.subjectIds.map((subjectId, index) => ({
                        subjectId,
                        isPrimary: index === 0,
                      })),
              }),
            },
          ];
        },
      });
      return { updated: true, derivations: [] };
    }

    if (input.projectId !== undefined) {
      const collector = createInProcessCollector(domainEventBus);
      const vcsCtx: VCSContext = {
        mode: "direct",
        projectId: input.projectId,
        createdBy: context.user.id,
      };
      const result = await drizzle.transaction(async (tx) => {
        const { middleware } = createVCSRouteHelper(tx);
        return await middleware.interceptMutationWrite(
          vcsCtx,
          "term_concept",
          async () => {
            const result = await executeCommand(
              { db: tx, collector },
              updateGlossaryConcept,
              { ...input, projectId: input.projectId },
            );
            if (
              !result.updated ||
              result.before === null ||
              result.after === null
            ) {
              return { mutation: null, result };
            }
            return {
              entityId: String(input.conceptId),
              action: "UPDATE" as const,
              before: result.before,
              after: result.after,
              result,
            };
          },
        );
      });
      if (result.updated) await collector.flush();
      return { updated: result.updated, derivations: result.derivations };
    }

    const collector = createInProcessCollector(domainEventBus);

    const result = await executeCommand(
      { db: drizzle, collector },
      updateGlossaryConcept,
      input,
    );

    if (result.updated) await collector.flush();
    return { updated: result.updated, derivations: result.derivations };
  });

export const addTermToConcept = authed
  .input(
    z.object({
      conceptId: z.int(),
      text: z.string(),
      languageId: z.string(),
      type: z.enum(TermTypeValues).optional().default("NOT_SPECIFIED"),
      status: z.enum(TermStatusValues).optional().default("PREFERRED"),
      branchId: z.int().optional(),
      projectId: z.uuidv4().optional(),
    }),
  )
  .use(withBranchContext, (i) => ({
    branchId: i.branchId,
    projectId: i.projectId,
  }))
  .use(checkPermission("glossary", "editor"), (input) =>
    input.conceptId.toString(),
  )
  .output(
    z.object({
      termId: z.int(),
      derivations: z.array(RecallDerivationReferenceSchema),
    }),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;
    if (context.branchId !== undefined) {
      if (input.projectId === undefined) {
        throw new ORPCError("BAD_REQUEST", {
          message: "projectId is required when branchId is provided",
        });
      }
      const branchWriteContext = await ensureBranchWriteContext({
        drizzle,
        branchId: context.branchId,
        branchChangesetId: context.branchChangesetId,
        branchProjectId: context.branchProjectId,
      });
      if (!branchWriteContext) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Invalid branch context for glossary term creation",
        });
      }
      const branchConcept = await resolveGlossaryConceptBranchState({
        db: drizzle,
        branchId: context.branchId,
        conceptId: input.conceptId,
      });
      if (branchConcept === null) throw new ORPCError("NOT_FOUND");
      await executeCommand({ db: drizzle }, assertProjectGlossaryBinding, {
        glossaryId: branchConcept.concept.glossaryId,
        projectId: branchWriteContext.projectId,
      });
      const ids = await executeCommand(
        { db: drizzle },
        reserveGlossaryEntityIds,
        { conceptCount: 0, termCount: 1 },
      );
      const termId = ids.termIds[0];
      if (termId === undefined)
        throw new Error("Glossary term ID reservation was incomplete.");
      await appendGlossaryBranchChanges({
        db: drizzle,
        changesetId: branchWriteContext.branchChangesetId,
        build: async () => {
          const before = await resolveGlossaryConceptBranchState({
            db: drizzle,
            branchId: context.branchId!,
            conceptId: input.conceptId,
          });
          if (before === null) throw new ORPCError("NOT_FOUND");
          return [
            {
              action: "UPDATE" as const,
              before,
              after: GlossaryConceptMaterializationSchema.parse({
                ...before,
                terms: [
                  ...before.terms,
                  {
                    id: termId,
                    termConceptId: before.concept.id,
                    creatorId: user.id,
                    text: input.text,
                    languageId: input.languageId,
                    type: input.type,
                    status: input.status,
                  },
                ],
              }),
            },
          ];
        },
      });
      return { termId, derivations: [] };
    }

    if (input.projectId !== undefined) {
      const collector = createInProcessCollector(domainEventBus);
      const vcsCtx: VCSContext = {
        mode: "direct",
        projectId: input.projectId,
        createdBy: user.id,
      };
      const result = await drizzle.transaction(async (tx) => {
        const { middleware } = createVCSRouteHelper(tx);
        return await middleware.interceptMutationWrite(
          vcsCtx,
          "term_concept",
          async () => {
            const result = await executeCommand(
              { db: tx, collector },
              addGlossaryTermToConcept,
              { ...input, creatorId: user.id, projectId: input.projectId },
            );
            return {
              entityId: String(result.conceptId),
              action: "UPDATE" as const,
              before: result.before,
              after: result.after,
              result,
            };
          },
        );
      });
      await collector.flush();
      return { termId: result.termId, derivations: result.derivations };
    }

    const collector = createInProcessCollector(domainEventBus);

    const result = await executeCommand(
      { db: drizzle, collector },
      addGlossaryTermToConcept,
      {
        ...input,
        creatorId: user.id,
      },
    );
    await collector.flush();

    return {
      termId: result.termId,
      derivations: result.derivations,
    };
  });

export const getConceptSubjects = authed
  .input(
    z.object({
      glossaryId: z.string(),
      branchId: z.int().optional(),
      projectId: z.uuidv4().optional(),
    }),
  )
  .use(withBranchContext, (i) => ({
    branchId: i.branchId,
    projectId: i.projectId,
  }))
  .output(z.array(z.object({ id: z.int(), subject: z.string() })))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    if (context.branchId !== undefined && input.projectId === undefined) {
      throw new ORPCError("BAD_REQUEST", {
        message: "projectId is required when branchId is provided",
      });
    }

    const mainItems = await executeQuery(
      { db: drizzle },
      listGlossaryConceptSubjects,
      {
        glossaryId: input.glossaryId,
      },
    );

    if (context.branchId !== undefined) {
      return await listWithOverlay(
        drizzle,
        context.branchId,
        "term",
        mainItems,
        (item) => String(item.id),
      );
    }

    return mainItems;
  });

// ─── Workflow Runner — Term Discovery ────────────────────────────────────────

/** 启动术语发现工作流，返回 runId */
export const startTermDiscovery = authed
  .input(
    termDiscoveryGraph.inputSchema.extend({
      /** 关联的项目 ID（用于在 WorkflowUI 中显示） */
      projectId: z.uuidv4(),
    }),
  )
  .output(z.object({ runId: z.uuidv4() }))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      pluginManager,
      user,
    } = context;

    const runtime = await getGraphRuntime(drizzle, pluginManager);

    // 找或创建 WORKFLOW 类型 AgentDefinition
    let existingDef = await executeQuery(
      { db: drizzle },
      findAgentDefinitionByNameAndScope,
      {
        name: "term-discovery",
        scopeType: "GLOBAL",
        scopeId: "",
        isBuiltin: true,
      },
    );

    if (!existingDef) {
      const defRow = await executeCommand(
        { db: drizzle },
        createAgentDefinition,
        {
          name: "term-discovery",
          description: "术语发现工作流",
          scopeType: "GLOBAL",
          scopeId: "",
          definitionId: "term-discovery",
          version: "1.0.0",
          type: "WORKFLOW",
          tools: [],
          content: "",
          isBuiltin: true,
        },
      );
      existingDef = await executeQuery(
        { db: drizzle },
        findAgentDefinitionByNameAndScope,
        {
          name: "term-discovery",
          scopeType: "GLOBAL",
          scopeId: "",
          isBuiltin: true,
        },
      );
      void defRow;
    }

    if (!existingDef) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Failed to obtain term-discovery agent definition",
      });
    }

    const sessionResult = await executeCommand(
      { db: drizzle },
      createAgentSession,
      {
        agentDefinitionId: existingDef.externalId,
        userId: user.id,
        projectId: input.projectId,
      },
    );

    // Resolve internal session ID via domain query
    const sessionRow = await executeQuery(
      { db: drizzle },
      getAgentSessionByExternalId,
      { externalId: sessionResult.sessionId },
    );

    if (!sessionRow) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Failed to resolve session",
      });
    }

    const shouldLoadAllProjectNodes =
      input.contentNodeIds.length === 0 && input.elementIds.length === 0;
    const projectContentNodes = shouldLoadAllProjectNodes
      ? await executeQuery({ db: drizzle }, listProjectContentNodes, {
          projectId: input.projectId,
        })
      : [];
    const resolvedContentNodeIds = shouldLoadAllProjectNodes
      ? projectContentNodes
          .filter((contentNode) => contentNode.kind !== "DIRECTORY")
          .map((contentNode) => contentNode.id)
      : input.contentNodeIds;

    if (input.elementIds.length === 0 && resolvedContentNodeIds.length === 0) {
      throw new ORPCError("BAD_REQUEST", {
        message: "No project content nodes available for term discovery",
      });
    }

    const resolvedGraphInput = {
      ...input,
      contentNodeIds: resolvedContentNodeIds,
    };

    const runId = await runtime.scheduler.start(
      "term-discovery",
      JSONObjectSchema.parse(resolvedGraphInput),
      {
        sessionId: sessionRow.id,
      },
    );

    return { runId };
  });

// ─── Workflow Runner — Term Alignment ────────────────────────────────────────

/** 启动术语对齐工作流，返回 runId */
export const startTermAlignment = authed
  .input(
    termAlignmentGraph.inputSchema.extend({
      /** 关联的项目 ID（用于在 WorkflowUI 中显示） */
      projectId: z.uuidv4(),
    }),
  )
  .output(z.object({ runId: z.uuidv4() }))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      pluginManager,
      user,
    } = context;

    const runtime = await getGraphRuntime(drizzle, pluginManager);

    // 找或创建 WORKFLOW 类型 AgentDefinition
    let existingAlignDef = await executeQuery(
      { db: drizzle },
      findAgentDefinitionByNameAndScope,
      {
        name: "term-alignment",
        scopeType: "GLOBAL",
        scopeId: "",
        isBuiltin: true,
      },
    );

    if (!existingAlignDef) {
      const defRow = await executeCommand(
        { db: drizzle },
        createAgentDefinition,
        {
          name: "term-alignment",
          description: "术语对齐工作流",
          scopeType: "GLOBAL",
          scopeId: "",
          definitionId: "term-alignment",
          version: "1.0.0",
          type: "WORKFLOW",
          tools: [],
          content: "",
          isBuiltin: true,
        },
      );
      existingAlignDef = await executeQuery(
        { db: drizzle },
        findAgentDefinitionByNameAndScope,
        {
          name: "term-alignment",
          scopeType: "GLOBAL",
          scopeId: "",
          isBuiltin: true,
        },
      );
      void defRow;
    }

    if (!existingAlignDef) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Failed to obtain term-alignment agent definition",
      });
    }

    const sessionResult = await executeCommand(
      { db: drizzle },
      createAgentSession,
      {
        agentDefinitionId: existingAlignDef.externalId,
        userId: user.id,
        projectId: input.projectId,
      },
    );

    // Resolve internal session ID via domain query
    const sessionRow = await executeQuery(
      { db: drizzle },
      getAgentSessionByExternalId,
      { externalId: sessionResult.sessionId },
    );

    if (!sessionRow) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Failed to resolve session",
      });
    }

    const { projectId: _ignored2, ...graphInput } = input;
    const runId = await runtime.scheduler.start(
      "term-alignment",
      JSONObjectSchema.parse(graphInput),
      {
        sessionId: sessionRow.id,
      },
    );

    return { runId };
  });

// ─── Workflow Result Query ────────────────────────────────────────────────────

/** 查询术语工作流运行状态与结果 */
export const getTermWorkflowResult = authed
  .input(z.object({ runId: z.uuidv4() }))
  .output(
    z.object({
      status: z.enum([
        "running",
        "completed",
        "failed",
        "cancelled",
        "paused",
        "pending",
      ]),
      result: z.unknown().optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    const row = await executeQuery({ db: drizzle }, loadAgentRunMetadata, {
      externalId: input.runId,
    });

    if (!row) {
      throw new ORPCError("NOT_FOUND", { message: "Workflow run not found" });
    }

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const status = row.status as
      | "running"
      | "completed"
      | "failed"
      | "cancelled"
      | "paused"
      | "pending";

    return { status };
  });

export const glossaryRouter = {
  deleteTerm,
  get,
  getUserOwned,
  getProjectOwned,
  countTerm,
  create,
  insertTerm,
  searchTerm,
  findTerm,
  updateConcept,
  addTermToConcept,
  getConceptSubjects,
  startTermDiscovery,
  startTermAlignment,
  getTermWorkflowResult,
};
