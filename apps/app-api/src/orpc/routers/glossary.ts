import { createTermTask } from "@cat/agent/workflow";
import {
  addGlossaryTermToConcept,
  countGlossaryConcepts,
  createInProcessCollector,
  createGlossary as createGlossaryCommand,
  deleteGlossaryTerm,
  domainEventBus,
  executeCommand,
  executeQuery,
  getElementWithChunkIds,
  getGlossary,
  listGlossaryConceptSubjects,
  listOwnedGlossaries,
  listProjectGlossaryIds,
  listProjectGlossaries,
  updateGlossaryConcept,
} from "@cat/domain";
import { streamSearchTermsOp } from "@cat/operations";
import { firstOrGivenService } from "@cat/server-shared";
import {
  TermStatusValues,
  TermTypeValues,
} from "@cat/shared/schema/drizzle/enum";
import { GlossarySchema } from "@cat/shared/schema/drizzle/glossary";
import { TermDataSchema } from "@cat/shared/schema/misc";
import { ORPCError } from "@orpc/client";
import * as z from "zod/v4";

import { authed } from "@/orpc/server";

export const deleteTerm = authed
  .input(
    z.object({
      termId: z.int(),
    }),
  )
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const collector = createInProcessCollector(domainEventBus);

    const result = await executeCommand(
      { db: drizzle, collector },
      deleteGlossaryTerm,
      input,
    );

    if (result.deleted) {
      await collector.flush();
    }
  });

export const get = authed
  .input(
    z.object({
      glossaryId: z.uuidv4(),
    }),
  )
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
    }),
  )
  .output(z.void())
  .handler(async ({ context, input }) => {
    const { pluginManager, user } = context;
    const { termsData, glossaryId } = input;

    const storage = firstOrGivenService(pluginManager, "VECTOR_STORAGE");
    const vectorizer = firstOrGivenService(pluginManager, "TEXT_VECTORIZER");

    if (!storage || !vectorizer) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "No storage provider available",
      });
    }

    await createTermTask.run({
      glossaryId,
      data: termsData,
      creatorId: user.id,
      vectorizerId: vectorizer.id,
      vectorStorageId: storage.id,
    });
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
  .handler(async function* ({ context, input }) {
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

    const stream = streamSearchTermsOp({
      glossaryIds,
      text,
      sourceLanguageId: termLanguageId,
      translationLanguageId,
      minConfidence,
    });

    for await (const t of stream) {
      yield {
        term: t.term,
        translation: t.translation,
        definition: t.definition,
        confidence: t.confidence,
        termLanguageId,
        translationLanguageId,
      };
    }
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
  .handler(async function* ({ context, input }) {
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

    const stream = streamSearchTermsOp({
      glossaryIds,
      text: element.value,
      sourceLanguageId: element.languageId,
      translationLanguageId,
      minConfidence,
    });

    for await (const t of stream) {
      yield {
        term: t.term,
        translation: t.translation,
        definition: t.definition,
        confidence: t.confidence,
        termLanguageId: element.languageId,
        translationLanguageId,
      };
    }
  });

export const updateConcept = authed
  .input(
    z.object({
      conceptId: z.int(),
      subjectIds: z.array(z.int()).optional(),
      definition: z.string().optional(),
    }),
  )
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const collector = createInProcessCollector(domainEventBus);

    const result = await executeCommand(
      { db: drizzle, collector },
      updateGlossaryConcept,
      input,
    );

    if (result.updated) {
      await collector.flush();
    }
  });

export const addTermToConcept = authed
  .input(
    z.object({
      conceptId: z.int(),
      text: z.string(),
      languageId: z.string(),
      type: z.enum(TermTypeValues).optional().default("NOT_SPECIFIED"),
      status: z.enum(TermStatusValues).optional().default("PREFERRED"),
    }),
  )
  .output(z.object({ termId: z.int() }))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;
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
    };
  });

export const getConceptSubjects = authed
  .input(
    z.object({
      glossaryId: z.string(),
    }),
  )
  .output(z.array(z.object({ id: z.int(), subject: z.string() })))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    return await executeQuery({ db: drizzle }, listGlossaryConceptSubjects, {
      glossaryId: input.glossaryId,
    });
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
};
