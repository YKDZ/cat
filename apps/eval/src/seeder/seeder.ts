import openAiVectorizer from "@cat-plugin/openai-vectorizer";
import openAiVectorizerManifest from "@cat-plugin/openai-vectorizer/manifest.json" with { type: "json" };
import openAiVectorizerPackage from "@cat-plugin/openai-vectorizer/package.json" with { type: "json" };
import spacyLanguageAnalyzer from "@cat-plugin/spacy-language-analyzer";
import spacyLanguageAnalyzerManifest from "@cat-plugin/spacy-language-analyzer/manifest.json" with { type: "json" };
import spacyLanguageAnalyzerPackage from "@cat-plugin/spacy-language-analyzer/package.json" with { type: "json" };
import { RedisConnection, sql } from "@cat/db";
// oxlint-disable no-console -- intentional diagnostic logging in eval harness
// oxlint-disable no-await-in-loop -- seeder is intentionally sequential
// oxlint-disable typescript-eslint/no-unsafe-type-assertion -- raw SQL results require casting
// oxlint-disable typescript-eslint/no-unsafe-return -- vectorize result requires cast
import type { ExecutorContext, OperationContext } from "@cat/domain";
import {
  attachChunkSetToString,
  createAgentDefinition,
  createElements,
  createGlossary,
  createGlossaryConcept,
  createGlossaryTerms,
  createMemory,
  createMemoryItems,
  createProject,
  createRootContentNode,
  createUser,
  createVectorizedChunks,
  createVectorizedStrings,
  ensureCoreRelationTypes,
  ensureLanguages,
  ensurePersonalProjectMemory,
  EnsureVectorStorageSchemaCommandSchema,
  ensureVectorStorageSchema,
  executeCommand,
  executeQuery,
  getLanguageAnalysisSelection,
  getPluginConfigInstance,
  getPluginConfigSchemaDigest,
  findAgentDefinitionByDefinitionIdAndScope,
  installPlugin,
  LanguageAnalysisSelectionConflictError,
  MemoryCacheStore,
  registerPluginDefinition,
  writePluginConfigInstance,
  writeValidatedLanguageAnalysisSelection,
} from "@cat/domain";
import {
  processVectorizationBatch,
  revectorizeConceptOp,
  startRecallDerivationWorker,
  validateLanguageAnalyzerConfiguration,
  waitForRecallDerivationFresh,
} from "@cat/operations";
import {
  getPermissionEngine,
  initPermissionEngine,
  type PermissionEngine,
} from "@cat/permissions";
import {
  BuiltinPluginLoader,
  CompositePluginLoader,
  FileSystemPluginLoader,
  PluginManager,
  type BuiltinPluginEntry,
  type CatPlugin,
  type PluginLoader,
  type ScopedPluginManagerInstallation,
} from "@cat/plugin-core";
import { normalizeMemorySeed } from "@cat/seed";
import {
  resolvePluginManager,
  selectFirstServiceImplementation,
  systemPgVectorEntry,
} from "@cat/server-shared";
import {
  LanguageAnalysisWildcardSelectionKey,
  PluginManifestSchema,
  RequiredVectorDimension,
  serviceImplementationReferenceKey,
} from "@cat/shared";
import type {
  JSONObject,
  JSONType,
  RecallDerivationReference,
} from "@cat/shared";
import { setupTestDB, installTestVectorizationQueue } from "@cat/test-utils";

import type { LoadedSuite } from "#/config/index.ts";
import type { PluginOverride } from "#/config/schemas.ts";

import { throwIfEvaluationAborted } from "../cancellation.ts";
import { runCleanupSteps } from "../cleanup.ts";
import { RefResolver } from "./ref-resolver.ts";
import type { SeededContext } from "./types.ts";
import { VectorCache } from "./vector-cache.ts";

export type SeedOptions = {
  suite: LoadedSuite;
  cacheDir: string;
  pluginsDir: string;
  signal?: AbortSignal | undefined;
};

const EVAL_REDIS_CONNECT_TIMEOUT_MS = 1_000;

const requireFirst = <T>(values: readonly T[], operation: string): T => {
  const value = values[0];
  if (value === undefined) {
    throw new Error(`${operation} returned no values`);
  }
  return value;
};

type SeedCleanupResources = {
  deactivatePlugins: () => Promise<void>;
  restorePermissionEngine: () => void;
  restoreVectorizationQueue: () => void;
  disconnectRedis: () => void;
  cleanupDatabase: () => Promise<void>;
};

export const createSeedCleanup = (
  resources: SeedCleanupResources,
): (() => Promise<void>) => {
  const steps = [
    { complete: false, action: resources.deactivatePlugins },
    {
      complete: false,
      action: async () => {
        resources.restorePermissionEngine();
      },
    },
    {
      complete: false,
      action: async () => {
        resources.restoreVectorizationQueue();
      },
    },
    {
      complete: false,
      action: async () => {
        resources.disconnectRedis();
      },
    },
    { complete: false, action: resources.cleanupDatabase },
  ];
  let cleanupAttempt: Promise<void> | undefined;

  return async () => {
    if (cleanupAttempt) return await cleanupAttempt;

    const attempt = runCleanupSteps(
      steps
        .filter((step) => !step.complete)
        .map((step) => async (): Promise<void> => {
          await step.action();
          step.complete = true;
        }),
    );
    cleanupAttempt = attempt;
    void attempt.then(
      () => {
        if (cleanupAttempt === attempt) cleanupAttempt = undefined;
      },
      () => {
        if (cleanupAttempt === attempt) cleanupAttempt = undefined;
      },
    );
    return await attempt;
  };
};

export const createRedisCleanup = (
  redis: RedisConnection,
  previousRedis: RedisConnection | undefined,
): (() => void) => {
  return () => {
    try {
      redis.disconnect();
    } finally {
      if (globalThis["__REDIS__"] === redis) {
        if (previousRedis === undefined)
          Reflect.deleteProperty(globalThis, "__REDIS__");
        else globalThis["__REDIS__"] = previousRedis;
      }
    }
  };
};

type SeedPluginRuntime = {
  activatedPluginIds: Set<string>;
  pluginManagerInstallation: ScopedPluginManagerInstallation | undefined;
};

export const createEvalPluginLoader = (
  externalLoader: PluginLoader,
): CompositePluginLoader =>
  new CompositePluginLoader([
    new BuiltinPluginLoader([systemPgVectorEntry, ...evalBuiltinPluginEntries]),
    externalLoader,
  ]);

const createBuiltinPluginEntry = (
  manifest: unknown,
  pkg: { name: string; version: string },
  plugin: CatPlugin,
): BuiltinPluginEntry => {
  const parsedManifest = PluginManifestSchema.parse(manifest);
  return {
    manifest: parsedManifest,
    data: {
      id: parsedManifest.id,
      name: pkg.name,
      version: parsedManifest.version ?? pkg.version,
      overview: parsedManifest.id,
      entry: parsedManifest.entry,
      config: parsedManifest.config,
      configVersion: parsedManifest.configVersion,
    },
    load: () => plugin,
  };
};

const evalBuiltinPluginEntries = [
  createBuiltinPluginEntry(
    openAiVectorizerManifest,
    openAiVectorizerPackage,
    openAiVectorizer,
  ),
  createBuiltinPluginEntry(
    spacyLanguageAnalyzerManifest,
    spacyLanguageAnalyzerPackage,
    spacyLanguageAnalyzer,
  ),
];

export const createSeedPluginCleanup = (
  runtime: SeedPluginRuntime,
  db: ExecutorContext["db"],
): (() => Promise<void>) => {
  return async () => {
    const installation = runtime.pluginManagerInstallation;
    if (installation === undefined) return;

    const errors: unknown[] = [];
    try {
      for (const pluginId of runtime.activatedPluginIds) {
        if (!installation.manager.isActive(pluginId)) continue;
        try {
          await installation.manager.deactivate(db, pluginId);
        } catch (error) {
          errors.push(error);
        }
      }
    } finally {
      installation.restore();
      runtime.pluginManagerInstallation = undefined;
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, "Eval plugin deactivation failed.");
    }
  };
};

const EvalLanguageAnalysisSelectionErrorCodes = [
  "AMBIGUOUS_CONFIGURED_SERVICE",
  "CONFIGURED_SERVICE_UNAVAILABLE",
  "SELECTION_WRITE_CONFLICT",
] as const;
type EvalLanguageAnalysisSelectionErrorCode =
  (typeof EvalLanguageAnalysisSelectionErrorCodes)[number];

export class EvalLanguageAnalysisSelectionError extends Error {
  public readonly code: EvalLanguageAnalysisSelectionErrorCode;

  public constructor(code: EvalLanguageAnalysisSelectionErrorCode) {
    super(`Eval language analysis selection failed: ${code}.`);
    this.name = "EvalLanguageAnalysisSelectionError";
    this.code = code;
  }
}

const selectionMatches = (
  selection: Awaited<ReturnType<typeof getLanguageAnalysisSelection>>,
  implementation: ReturnType<
    PluginManager["createServiceImplementationReference"]
  >,
  fingerprint: string,
): boolean =>
  selection !== null &&
  selection.implementation !== null &&
  selection.configurationFingerprint === fingerprint &&
  serviceImplementationReferenceKey(selection.implementation) ===
    serviceImplementationReferenceKey(implementation);

export const ensureEvalLanguageAnalysisSelection = async (
  db: ExecutorContext["db"],
  pluginManager: PluginManager,
  overrides: readonly PluginOverride[],
): Promise<void> => {
  const configuredPluginIds: string[] = [];
  for (const { plugin } of overrides) {
    const manifest = await pluginManager.getLoader().getManifest(plugin);
    if (
      manifest.services?.some(({ type }) => type === "LANGUAGE_ANALYZER") ??
      false
    ) {
      configuredPluginIds.push(plugin);
    }
  }
  if (configuredPluginIds.length === 0) return;
  if (configuredPluginIds.length !== 1) {
    throw new EvalLanguageAnalysisSelectionError(
      "AMBIGUOUS_CONFIGURED_SERVICE",
    );
  }

  const configuredPluginId = configuredPluginIds[0];
  if (configuredPluginId === undefined) {
    throw new EvalLanguageAnalysisSelectionError(
      "CONFIGURED_SERVICE_UNAVAILABLE",
    );
  }
  const services = pluginManager
    .getServices("LANGUAGE_ANALYZER")
    .filter(({ pluginId }) => pluginId === configuredPluginId);
  if (services.length !== 1) {
    throw new EvalLanguageAnalysisSelectionError(
      "CONFIGURED_SERVICE_UNAVAILABLE",
    );
  }
  const service = services[0];
  if (service === undefined) {
    throw new EvalLanguageAnalysisSelectionError(
      "CONFIGURED_SERVICE_UNAVAILABLE",
    );
  }

  const implementation =
    pluginManager.createServiceImplementationReference(service);
  const configuration = await validateLanguageAnalyzerConfiguration(
    implementation,
    { pluginManager, traceId: "eval-language-analysis-selection" },
  );
  const existing = await executeQuery({ db }, getLanguageAnalysisSelection, {
    key: LanguageAnalysisWildcardSelectionKey,
  });
  if (selectionMatches(existing, implementation, configuration.fingerprint))
    return;

  const write = async (expectedRevision: number) =>
    await executeCommand({ db }, writeValidatedLanguageAnalysisSelection, {
      key: LanguageAnalysisWildcardSelectionKey,
      expectedRevision,
      implementation,
      configurationFingerprint: configuration.fingerprint,
    });
  try {
    await write(existing?.revision ?? 0);
  } catch (error) {
    if (!(error instanceof LanguageAnalysisSelectionConflictError)) throw error;
    const winner = await executeQuery({ db }, getLanguageAnalysisSelection, {
      key: LanguageAnalysisWildcardSelectionKey,
    });
    if (selectionMatches(winner, implementation, configuration.fingerprint))
      return;
    try {
      await write(winner?.revision ?? 0);
    } catch (retryError) {
      if (retryError instanceof LanguageAnalysisSelectionConflictError) {
        const retryWinner = await executeQuery(
          { db },
          getLanguageAnalysisSelection,
          { key: LanguageAnalysisWildcardSelectionKey },
        );
        if (
          selectionMatches(
            retryWinner,
            implementation,
            configuration.fingerprint,
          )
        )
          return;
        throw new EvalLanguageAnalysisSelectionError(
          "SELECTION_WRITE_CONFLICT",
        );
      }
      throw retryError;
    }
  }
};

export const seed = async (opts: SeedOptions): Promise<SeededContext> => {
  const testDb = await setupTestDB();
  const previousRedis = globalThis["__REDIS__"];
  const previousPermissionEngine = globalThis.__PERMISSION_ENGINE__;
  const runtime: SeedRuntime = {
    activatedPluginIds: new Set<string>(),
    pluginManagerInstallation: undefined,
    permissionEngine: undefined,
    restoreVectorizationQueue: (): void => {},
  };
  let cleanupRedis = (): void => {};
  const cleanup = createSeedCleanup({
    deactivatePlugins: createSeedPluginCleanup(runtime, testDb.client),
    restorePermissionEngine: () => {
      if (globalThis.__PERMISSION_ENGINE__ === runtime.permissionEngine) {
        globalThis.__PERMISSION_ENGINE__ = previousPermissionEngine;
      }
    },
    restoreVectorizationQueue: () => runtime.restoreVectorizationQueue(),
    disconnectRedis: () => cleanupRedis(),
    cleanupDatabase: async () => await testDb.cleanup(),
  });

  try {
    const requiresRedis =
      !Array.isArray(opts.suite.config.scenarios) ||
      opts.suite.config.scenarios.some(
        ({ type }) => type === "agent-translate",
      );
    let redis: RedisConnection | undefined;
    if (requiresRedis) {
      redis = new RedisConnection({
        mode: "fail-fast",
        connectTimeoutMs: EVAL_REDIS_CONNECT_TIMEOUT_MS,
        onError: () => {},
      });
      cleanupRedis = createRedisCleanup(redis, previousRedis);
      await redis.connect();
      globalThis["__REDIS__"] = redis;
    }
    return await hydrateSeed(opts, { cleanup, runtime, testDb, redis });
  } catch (error) {
    try {
      await cleanup();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Eval seed failed and cleanup failed.",
      );
    }
    throw error;
  }
};

type SeedResources = {
  cleanup: () => Promise<void>;
  redis: RedisConnection | undefined;
  runtime: SeedRuntime;
  testDb: Awaited<ReturnType<typeof setupTestDB>>;
};

type SeedRuntime = SeedPluginRuntime & {
  permissionEngine: PermissionEngine | undefined;
  restoreVectorizationQueue: () => void;
};

export const completeEvalConceptVectorization = async (
  queue: Parameters<typeof processVectorizationBatch>[0],
  batchSize: number,
  context: OperationContext,
  processBatch: typeof processVectorizationBatch = processVectorizationBatch,
): Promise<void> => {
  await processBatch(queue, batchSize, context);
  if ((await queue.pendingCount()) > 0) {
    throw new Error(
      "Eval concept vectorization did not complete through the configured vector storage.",
    );
  }
};

const hydrateSeed = async (
  opts: SeedOptions,
  { cleanup, redis, runtime, testDb }: SeedResources,
): Promise<SeededContext> => {
  const { suite, cacheDir, pluginsDir } = opts;
  const { config, projectSeed, glossarySeed, memorySeed, elementsSeed } = suite;
  const refs = new RefResolver();
  const memoryContainers = memorySeed ? normalizeMemorySeed(memorySeed) : [];

  throwIfEvaluationAborted(opts.signal);

  // ── 1a. Vectorization queue setup ─────────────────────────────────
  // Install an in-memory queue so submit_translation can enqueue
  // vectorization tasks without needing the full app bootstrap.
  const vectorizationQueue = installTestVectorizationQueue();
  runtime.restoreVectorizationQueue = vectorizationQueue.restore;

  throwIfEvaluationAborted(opts.signal);

  // ── 2a. Permission engine setup ────────────────────────────────────
  // Agent tools call getPermissionEngine() during translation; initialize
  // a permissive in-memory-backed engine so eval runs without a full server.
  runtime.permissionEngine = initPermissionEngine({
    db: testDb.client,
    cache: new MemoryCacheStore("eval-perm"),
    auditEnabled: false,
  });

  // ── 3. Plugin manager setup ────────────────────────────────────────
  let externalLoader: PluginLoader;
  if (config.plugins.loader === "test") {
    const { TestPluginLoader } = await import("@cat/test-utils");
    externalLoader = new TestPluginLoader({ includeLanguageAnalyzer: true });
  } else {
    externalLoader = new FileSystemPluginLoader({ pluginsDir });
  }
  const loader = createEvalPluginLoader(externalLoader);
  const pluginManagerInstallation = PluginManager.installScoped(
    "GLOBAL",
    "",
    loader,
  );
  runtime.pluginManagerInstallation = pluginManagerInstallation;
  const pluginManager = pluginManagerInstallation.manager;

  const execCtx: ExecutorContext = { db: testDb.client };

  // ── 4. Plugin registration + config overrides ──────────────────────
  const testUser = await executeCommand(execCtx, createUser, {
    email: "eval@test.internal",
    name: "Eval Test User",
  });
  const userId = testUser.id;
  refs.set("user:eval", userId);

  const systemVectorStorage = await loader.getData("system-pgvector-storage");
  await executeCommand(execCtx, registerPluginDefinition, {
    pluginId: systemVectorStorage.id,
    version: systemVectorStorage.version,
    name: systemVectorStorage.name,
    entry: systemVectorStorage.entry,
    overview: systemVectorStorage.overview ?? "",
    iconUrl: systemVectorStorage.iconURL ?? null,
    configSchema: systemVectorStorage.config,
    configVersion: systemVectorStorage.configVersion,
  });
  await executeCommand(execCtx, installPlugin, {
    pluginId: systemVectorStorage.id,
    scopeType: "GLOBAL",
    scopeId: "",
  });
  await pluginManager.activate(testDb.client, systemVectorStorage.id);
  runtime.activatedPluginIds.add(systemVectorStorage.id);

  for (const override of config.plugins.overrides) {
    throwIfEvaluationAborted(opts.signal);
    const data = await loader.getData(override.plugin);
    await executeCommand(execCtx, registerPluginDefinition, {
      pluginId: data.id,
      version: data.version,
      name: data.name,
      entry: data.entry,
      overview: data.overview ?? "",
      iconUrl: data.iconURL ?? null,
      configSchema: data.config,
      configVersion: data.configVersion,
    });
    await executeCommand(execCtx, installPlugin, {
      pluginId: data.id,
      scopeType: override.scope,
      scopeId: override.scopeId ?? "",
    });
    if (data.config !== undefined) {
      if (!data.configVersion) {
        throw new Error(
          `Plugin ${data.id} declares config without configVersion`,
        );
      }
      const instance = await executeQuery(execCtx, getPluginConfigInstance, {
        pluginId: override.plugin,
        scopeType: override.scope,
        scopeId: override.scopeId ?? "",
      });
      if (!instance)
        throw new Error(
          `Plugin ${override.plugin} config instance was not created`,
        );
      await executeCommand(execCtx, writePluginConfigInstance, {
        pluginId: override.plugin,
        scopeType: override.scope,
        scopeId: override.scopeId ?? "",
        creatorId: userId,
        value: override.config,
        expectedSchemaVersion: data.configVersion,
        expectedSchemaDigest: getPluginConfigSchemaDigest(data.config),
        expectedRevision: instance.revision,
      });
    }
    await pluginManager.activate(testDb.client, data.id);
    runtime.activatedPluginIds.add(data.id);
  }

  const vectorStorage = pluginManager.getServices("VECTOR_STORAGE");
  const selectedVectorStorage = selectFirstServiceImplementation(
    pluginManager,
    "VECTOR_STORAGE",
  );
  if (
    vectorStorage.length !== 1 ||
    selectedVectorStorage?.reference.pluginId !== "system-pgvector-storage" ||
    selectedVectorStorage.reference.serviceId !== "native-pgvector"
  ) {
    throw new Error(
      "Eval requires exactly system-pgvector-storage:native-pgvector as vector storage.",
    );
  }

  await ensureEvalLanguageAnalysisSelection(
    testDb.client,
    pluginManager,
    config.plugins.overrides,
  );

  // ── 5. Vector schema attestation ───────────────────────────────────
  const vectorizerOverride = config.plugins.overrides.find(
    (o) => o.plugin === "openai-vectorizer" || o.plugin.includes("vectorizer"),
  );
  await executeCommand(
    execCtx,
    ensureVectorStorageSchema,
    EnsureVectorStorageSchemaCommandSchema.parse({
      dimension: RequiredVectorDimension,
    }),
  );

  // ── 6. Languages ───────────────────────────────────────────────────
  const allLanguages = new Set<string>();
  allLanguages.add(projectSeed.sourceLanguage);
  for (const lang of projectSeed.translationLanguages) allLanguages.add(lang);
  if (glossarySeed) {
    allLanguages.add(glossarySeed.glossary.sourceLanguage);
    allLanguages.add(glossarySeed.glossary.translationLanguage);
    if (config.vectorization === "required") allLanguages.add("mul");
  }
  for (const memoryContainer of memoryContainers) {
    throwIfEvaluationAborted(opts.signal);
    for (const item of memoryContainer.items) {
      allLanguages.add(item.sourceLanguage);
      allLanguages.add(item.translationLanguage);
    }
  }
  await executeCommand(execCtx, ensureLanguages, {
    languageIds: [...allLanguages],
  });

  // ── 7. Project + root content node ─────────────────────────────────
  const project = await executeCommand(execCtx, createProject, {
    name: projectSeed.name,
    description: null,
    creatorId: userId,
  });
  refs.set("project", project.id);

  const rootNode = await executeCommand(execCtx, createRootContentNode, {
    projectId: project.id,
    creatorId: userId,
  });
  refs.set("content-node:root", rootNode.id);

  // ── 8. Glossary seeding ────────────────────────────────────────────
  const recallDerivations: RecallDerivationReference[] = [];
  const glossaryConceptIds: number[] = [];
  let glossaryId: string | undefined;
  if (glossarySeed) {
    const g = glossarySeed.glossary;
    const glossary = await executeCommand(execCtx, createGlossary, {
      name: g.name,
      creatorId: userId,
      projectIds: [project.id],
    });
    glossaryId = glossary.id;
    refs.set("glossary", glossaryId);

    for (const conceptSeed of g.concepts) {
      throwIfEvaluationAborted(opts.signal);
      await executeCommand(execCtx, createVectorizedStrings, {
        data: [{ text: conceptSeed.definition, languageId: g.sourceLanguage }],
      });

      const concept = await executeCommand(execCtx, createGlossaryConcept, {
        glossaryId,
        definition: conceptSeed.definition,
      });
      refs.set(conceptSeed.ref, concept.id);
      glossaryConceptIds.push(concept.id);

      const created = await executeCommand(execCtx, createGlossaryTerms, {
        glossaryId,
        creatorId: userId,
        data: conceptSeed.terms.map(
          (t: (typeof conceptSeed.terms)[number]) => ({
            conceptId: concept.id,
            term: t.term,
            termLanguageId: t.termLanguageId,
            translation: t.translation,
            translationLanguageId: t.translationLanguageId,
            definition: conceptSeed.definition,
          }),
        ),
      });
      recallDerivations.push(...created.derivations);
    }
  }

  // ── 9. Memory seeding ──────────────────────────────────────────────
  let memoryId: string | undefined;
  let defaultMemoryRefBound = false;
  for (const memoryContainer of memoryContainers) {
    let containerMemoryId: string;

    if (memoryContainer.scope === "PERSONAL") {
      const ownerRef = memoryContainer.ownerRef;
      if (!ownerRef) {
        throw new Error("personal memory container requires ownerRef");
      }

      const personalMemory = await executeCommand(
        execCtx,
        ensurePersonalProjectMemory,
        {
          userId: refs.resolve(ownerRef),
          projectId: project.id,
          name: memoryContainer.name,
        },
      );

      containerMemoryId = personalMemory.memoryId;
    } else {
      const createdMemory = await executeCommand(execCtx, createMemory, {
        name: memoryContainer.name,
        creatorId: userId,
        projectIds: [project.id],
      });

      containerMemoryId = createdMemory.id;
    }

    if (!memoryId || memoryContainer.scope === "PROJECT") {
      memoryId = containerMemoryId;
    }

    if (memoryContainer.ref) {
      refs.set(memoryContainer.ref, containerMemoryId);
    }

    if (!defaultMemoryRefBound && memoryContainer.ref !== "memory") {
      refs.set("memory", containerMemoryId);
      defaultMemoryRefBound = true;
    } else if (memoryContainer.ref === "memory") {
      defaultMemoryRefBound = true;
    }

    for (const itemSeed of memoryContainer.items) {
      throwIfEvaluationAborted(opts.signal);
      const sourceStringIds = await executeCommand(
        execCtx,
        createVectorizedStrings,
        {
          data: [
            { text: itemSeed.source, languageId: itemSeed.sourceLanguage },
          ],
        },
      );
      const translationStringIds = await executeCommand(
        execCtx,
        createVectorizedStrings,
        {
          data: [
            {
              text: itemSeed.translation,
              languageId: itemSeed.translationLanguage,
            },
          ],
        },
      );

      const sourceStringId = requireFirst(
        sourceStringIds,
        "create source vectorized string",
      );
      const translationStringId = requireFirst(
        translationStringIds,
        "create translation vectorized string",
      );
      const created = await executeCommand(execCtx, createMemoryItems, {
        memoryId: containerMemoryId,
        items: [
          {
            translationId: null,
            translationStringId,
            sourceStringId,
            creatorId: userId,
          },
        ],
      });
      const memoryItem = requireFirst(created.items, "create memory item");
      refs.set(itemSeed.ref, memoryItem.id);
      recallDerivations.push(...created.derivations);
    }
  }
  if (recallDerivations.length > 0) {
    const recallDerivationWorker = await startRecallDerivationWorker({
      db: testDb.client,
      pluginManager,
    });
    try {
      await waitForRecallDerivationFresh(recallDerivations, {
        db: testDb.client,
        signal: opts.signal,
      });
    } finally {
      await recallDerivationWorker.stop();
    }
  }

  // ── 9b. Core relation types ──────────────────────────────────────
  // createElements requires core:contains:1.0.0 to exist.
  await executeCommand(execCtx, ensureCoreRelationTypes, {});

  // ── 10. Element seeding ────────────────────────────────────────────
  let contentNodeId: string | undefined = rootNode.id;
  if (elementsSeed) {
    for (const elSeed of elementsSeed.elements) {
      throwIfEvaluationAborted(opts.signal);
      const stringIds = await executeCommand(execCtx, createVectorizedStrings, {
        data: [{ text: elSeed.text, languageId: projectSeed.sourceLanguage }],
      });

      const elementIds = await executeCommand(execCtx, createElements, {
        data: [
          {
            projectId: project.id,
            primaryContentNodeId: rootNode.id,
            importerId: "eval",
            sourceRootRef: `project:${project.id}`,
            sourceNodeRef: `eval#${elSeed.ref}`,
            stableSourceRef: `eval#${elSeed.ref}`,
            stringId: requireFirst(stringIds, "create element source string"),
            creatorId: userId,
            meta: elSeed.meta as JSONType | undefined,
          },
        ],
      });
      refs.set(elSeed.ref, requireFirst(elementIds, "create element"));
    }
  }

  // ── 11. Vectorization with cache ───────────────────────────────────
  await vectorizeWithCache({
    execCtx,
    pluginManager,
    cache: new VectorCache(cacheDir),
    vectorizerOverride,
    mode: config.vectorization,
    signal: opts.signal,
  });
  if (config.vectorization === "required") {
    const vectorizer = selectFirstServiceImplementation(
      pluginManager,
      "TEXT_VECTORIZER",
    );
    const vectorStorage = selectFirstServiceImplementation(
      pluginManager,
      "VECTOR_STORAGE",
    );
    if (!vectorizer || !vectorStorage) {
      throw new Error(
        "Eval suite requires vectorization but no vectorizer or storage service is available.",
      );
    }
    const vectorizationContext: OperationContext = {
      traceId: `eval-vectorization-${crypto.randomUUID()}`,
      pluginManager,
    };
    for (const conceptId of glossaryConceptIds) {
      throwIfEvaluationAborted(opts.signal);
      await revectorizeConceptOp(
        {
          conceptId,
          vectorizer: vectorizer.reference,
          vectorStorage: vectorStorage.reference,
        },
        vectorizationContext,
      );
    }
    await completeEvalConceptVectorization(
      vectorizationQueue,
      glossaryConceptIds.length,
      vectorizationContext,
    );
  }

  // ── 12. Agent definition registration ────────────────────────────
  let agentDefinitionId: string | undefined;
  let agentDefinitionKey: string | undefined; // definitionId used as permission subject
  if (config.seed.agentDefinition) {
    const agentDefValue = config.seed.agentDefinition;

    if (agentDefValue.endsWith(".md")) {
      // File-based agent definition — parse MD and create in DB
      const { parseAgentDefinition } = await import("@cat/agent");
      const nodePath = await import("node:path");
      const { readFileSync, existsSync } = await import("node:fs");
      const mdPath = nodePath.resolve(suite.suiteDir, agentDefValue);
      if (!existsSync(mdPath)) {
        throw new Error(
          `Agent definition file not found: "${mdPath}" (resolved from "${agentDefValue}" in suite.yaml seed.agentDefinition)`,
        );
      }
      const mdContent = readFileSync(mdPath, "utf-8");
      const { metadata, content } = parseAgentDefinition(mdContent);

      const payload = {
        name: metadata.name,
        description: "",
        scopeType: "GLOBAL" as const,
        scopeId: "",
        definitionId: metadata.id ?? agentDefValue,
        version: metadata.version,
        icon: metadata.icon,
        type: metadata.type,
        llmConfig: metadata.llm,
        tools: metadata.tools,
        promptConfig: metadata.promptConfig,
        constraints: metadata.constraints,
        securityPolicy: metadata.securityPolicy,
        orchestration: metadata.orchestration,
        content,
        isBuiltin: false,
      };

      // Check if already exists (idempotent)
      const existing = await executeQuery(
        execCtx,
        findAgentDefinitionByDefinitionIdAndScope,
        {
          definitionId: payload.definitionId,
          scopeType: "GLOBAL",
          scopeId: "",
        },
      );
      if (existing) {
        agentDefinitionId = existing.externalId;
      } else {
        const created = await executeCommand(
          execCtx,
          createAgentDefinition,
          payload,
        );
        agentDefinitionId = created.id;
      }
      agentDefinitionKey = payload.definitionId;
      refs.set("agent-definition", agentDefinitionId);
    } else {
      // Builtin agent definition — register builtins and look up by ID
      const { registerBuiltinAgents } = await import("@cat/agent");
      await registerBuiltinAgents(testDb.client);
      const agentDef = await executeQuery(
        execCtx,
        findAgentDefinitionByDefinitionIdAndScope,
        {
          definitionId: agentDefValue,
          scopeType: "GLOBAL",
          scopeId: "",
        },
      );
      if (agentDef) {
        agentDefinitionId = agentDef.externalId;
        agentDefinitionKey = agentDefValue;
        refs.set("agent-definition", agentDefinitionId);
      }
    }

    // Grant the agent editor + direct_editor access on the project so
    // AgentRuntime.runLoop() can pass determineWriteMode() checks.
    if (agentDefinitionKey) {
      const engine = getPermissionEngine();
      await engine.grant({ type: "agent", id: agentDefinitionKey }, "editor", {
        type: "project",
        id: project.id,
      });
      await engine.grant(
        { type: "agent", id: agentDefinitionKey },
        "direct_editor",
        { type: "project", id: project.id },
      );
    }
  }

  return {
    db: testDb,
    ...(redis === undefined ? {} : { redis }),
    pluginManager,
    refs,
    projectId: project.id,
    glossaryId,
    memoryId,
    contentNodeId,
    agentDefinitionId,
    userId,
    cleanup: async () => {
      await cleanup();
    },
  };
};

const isRecordConfig = (
  config: PluginOverride["config"] | undefined,
): config is JSONObject => {
  return (
    typeof config === "object" && config !== null && !Array.isArray(config)
  );
};

const getVectorizerModelName = (
  override: PluginOverride | undefined,
): string => {
  if (!override || !isRecordConfig(override.config)) return "unknown";
  const model = override.config.model ?? override.config["model-id"];
  return typeof model === "string" ? model : "unknown";
};

const EvalVectorizationErrorCodes = [
  "CONFIGURED_SERVICE_UNAVAILABLE",
  "VECTORIZATION_FAILED",
  "VECTOR_DIMENSION_MISMATCH",
  "VECTOR_STORAGE_FAILED",
] as const;
type EvalVectorizationErrorCode = (typeof EvalVectorizationErrorCodes)[number];

export class EvalVectorizationError extends Error {
  public readonly code: EvalVectorizationErrorCode;

  public constructor(
    code: EvalVectorizationErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "EvalVectorizationError";
    this.code = code;
  }
}

export type EvalVectorizationResult =
  | { status: "VECTORIZED" }
  | { status: "SKIPPED"; reason: "EXPLICIT_SUITE_POLICY" };

export const vectorizeWithCache = async (opts: {
  execCtx: ExecutorContext;
  pluginManager: PluginManager;
  cache: VectorCache;
  vectorizerOverride: PluginOverride | undefined;
  mode: LoadedSuite["config"]["vectorization"];
  signal?: AbortSignal | undefined;
}): Promise<EvalVectorizationResult> => {
  const { execCtx, pluginManager, cache, vectorizerOverride, mode, signal } =
    opts;
  const modelName = getVectorizerModelName(vectorizerOverride);

  try {
    throwIfEvaluationAborted(signal);
    if (mode === "skip") {
      return { status: "SKIPPED", reason: "EXPLICIT_SUITE_POLICY" };
    }
    const pm = resolvePluginManager(pluginManager);
    const vectorizerEntry = selectFirstServiceImplementation(
      pm,
      "TEXT_VECTORIZER",
    );
    const storageEntry = selectFirstServiceImplementation(pm, "VECTOR_STORAGE");
    if (!vectorizerEntry || !storageEntry) {
      throw new EvalVectorizationError(
        "CONFIGURED_SERVICE_UNAVAILABLE",
        "Eval suite requires vectorization but no vectorizer or storage service is available.",
      );
    }
    const vectorizer = vectorizerEntry.service;
    const storage = storageEntry.service;
    const db = execCtx.db;
    const pendingRows = await db.execute(
      sql`SELECT id, value, language_id FROM "VectorizedString" WHERE status = 'PENDING_VECTORIZE'`,
    );

    if (!pendingRows.rows || pendingRows.rows.length === 0)
      return { status: "VECTORIZED" };

    for (const row of pendingRows.rows) {
      throwIfEvaluationAborted(signal);
      const stringId = row.id as number;
      const text = row.value as string;
      const languageId = row.language_id as string;

      const cached = cache.get(modelName, text, languageId);
      let chunkDataArrays: Array<
        Array<{ meta: Record<string, unknown> | null; vector: number[] }>
      >;

      if (cached) {
        chunkDataArrays = cached;
      } else {
        try {
          const result = await vectorizer.vectorize({
            elements: [{ text, languageId }],
            ...(signal === undefined ? {} : { signal }),
          });
          chunkDataArrays = result.map((r: unknown) =>
            Array.isArray(r) ? r : [r],
          ) as typeof chunkDataArrays;
        } catch (err) {
          throwIfEvaluationAborted(signal);
          throw new EvalVectorizationError(
            "VECTORIZATION_FAILED",
            `Failed to vectorize string ${stringId} with model "${modelName}".`,
            { cause: err },
          );
        }
      }

      if (
        chunkDataArrays.some((chunks) =>
          chunks.some(
            (chunk) => chunk.vector.length !== RequiredVectorDimension,
          ),
        )
      ) {
        const dimensions = chunkDataArrays.flatMap((chunks) =>
          chunks.map((chunk) => chunk.vector.length),
        );
        cache.invalidateModel(modelName);
        throw new EvalVectorizationError(
          "VECTOR_DIMENSION_MISMATCH",
          `Vectorizer model "${modelName}" returned vector dimensions [${dimensions.join(", ")}], expected ${RequiredVectorDimension}.`,
        );
      }
      if (!cached) cache.set(modelName, text, languageId, chunkDataArrays);

      try {
        const flatChunks = chunkDataArrays.flatMap((chunks, textIdx) =>
          chunks.map((chunk) => ({
            textIndex: textIdx,
            meta: chunk.meta as JSONType | undefined,
          })),
        );

        const { chunkSetIds, chunkIds } = await executeCommand(
          execCtx,
          createVectorizedChunks,
          {
            vectorizer: vectorizerEntry.reference,
            vectorStorage: storageEntry.reference,
            chunkSetCount: chunkDataArrays.length,
            chunks: flatChunks,
          },
        );

        const vectorPairs = chunkDataArrays.flatMap((chunks) =>
          chunks.map((chunk, i) => ({
            chunkId: requireFirst(
              chunkIds.slice(i, i + 1),
              "create vectorized chunk",
            ),
            vector: chunk.vector,
          })),
        );
        await storage.store({ chunks: vectorPairs });

        await executeCommand(execCtx, attachChunkSetToString, {
          updates: [
            {
              stringId,
              chunkSetId: requireFirst(
                chunkSetIds,
                "create vectorized chunk set",
              ),
            },
          ],
        });
      } catch (err) {
        throw new EvalVectorizationError(
          "VECTOR_STORAGE_FAILED",
          `Failed to store vectors for string ${stringId}.`,
          { cause: err },
        );
      }
    }
    return { status: "VECTORIZED" };
  } finally {
    cache.close();
  }
};
