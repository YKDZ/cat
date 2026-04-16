// oxlint-disable no-console -- intentional diagnostic logging in eval harness
// oxlint-disable no-await-in-loop -- seeder is intentionally sequential
// oxlint-disable typescript-eslint/no-unsafe-type-assertion -- raw SQL results require casting
// oxlint-disable typescript-eslint/no-unsafe-return -- vectorize result requires cast
import type { ExecutorContext } from "@cat/domain";
import type { JSONType } from "@cat/shared/schema/json";

import { RedisConnection, sql } from "@cat/db";
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
  createRootDocument,
  createUser,
  createVectorizedChunks,
  createVectorizedStrings,
  ensureLanguages,
  ensureVectorStorageSchema,
  executeCommand,
  executeQuery,
  findAgentDefinitionByDefinitionIdAndScope,
  installPlugin,
  registerPluginDefinition,
  upsertPluginConfigInstance,
} from "@cat/domain";
import {
  buildMemoryRecallVariantsOp,
  buildTermRecallVariantsOp,
} from "@cat/operations";
import { FileSystemPluginLoader, PluginManager } from "@cat/plugin-core";
import { firstOrGivenService, resolvePluginManager } from "@cat/server-shared";
import { setupTestDB, installTestVectorizationQueue } from "@cat/test-utils";

import type { LoadedSuite } from "@/config";
import type { PluginOverride } from "@/config/schemas";

import type { SeededContext } from "./types";

import { RefResolver } from "./ref-resolver";
import { VectorCache } from "./vector-cache";

export type SeedOptions = {
  suite: LoadedSuite;
  cacheDir: string;
  pluginsDir: string;
};

export const seed = async (opts: SeedOptions): Promise<SeededContext> => {
  const { suite, cacheDir, pluginsDir } = opts;
  const { config, projectSeed, glossarySeed, memorySeed, elementsSeed } = suite;
  const refs = new RefResolver();

  // ── 1. Database setup ──────────────────────────────────────────────
  const testDb = await setupTestDB();

  // ── 1a. Vectorization queue setup ─────────────────────────────────
  // Install an in-memory queue so submit_translation can enqueue
  // vectorization tasks without needing the full app bootstrap.
  installTestVectorizationQueue();

  // ── 2. Redis setup ─────────────────────────────────────────────────
  const redis = new RedisConnection();
  await redis.connect();
  globalThis["__REDIS__"] = redis;

  // ── 3. Plugin manager setup ────────────────────────────────────────
  PluginManager.clear();
  let loader;
  if (config.plugins.loader === "test") {
    const { TestPluginLoader } = await import("@cat/test-utils");
    loader = new TestPluginLoader();
  } else {
    loader = new FileSystemPluginLoader(pluginsDir);
  }
  const pluginManager = PluginManager.get("GLOBAL", "", loader);

  const execCtx: ExecutorContext = { db: testDb.client };

  // ── 4. Plugin registration + config overrides ──────────────────────
  const testUser = await executeCommand(execCtx, createUser, {
    email: "eval@test.internal",
    name: "Eval Test User",
  });
  const userId = testUser.id;
  refs.set("user:eval", userId);

  for (const override of config.plugins.overrides) {
    const data = await loader.getData(override.plugin);
    await executeCommand(execCtx, registerPluginDefinition, {
      pluginId: data.id,
      version: data.version,
      name: data.name,
      entry: data.entry,
      overview: data.overview ?? "",
      iconUrl: data.iconURL ?? null,
      configSchema: data.config,
    });
    await executeCommand(execCtx, installPlugin, {
      pluginId: data.id,
      scopeType: override.scope,
      scopeId: override.scopeId ?? "",
    });
    if (data.config !== undefined) {
      await executeCommand(execCtx, upsertPluginConfigInstance, {
        pluginId: override.plugin,
        scopeType: override.scope,
        scopeId: override.scopeId ?? "",
        creatorId: userId,
        value: override.config,
      });
    }
    await pluginManager.activate(testDb.client, data.id);
  }

  // ── 5. Dimension reconciliation ────────────────────────────────────
  const vectorizerOverride = config.plugins.overrides.find(
    (o) => o.plugin === "openai-vectorizer" || o.plugin.includes("vectorizer"),
  );
  const dimension = getDimensionFromConfig(vectorizerOverride) ?? 1024;
  await execCtx.db.execute(sql`DROP TABLE IF EXISTS "Vector" CASCADE`);
  await executeCommand(execCtx, ensureVectorStorageSchema, { dimension });

  // ── 6. Languages ───────────────────────────────────────────────────
  const allLanguages = new Set<string>();
  allLanguages.add(projectSeed.sourceLanguage);
  for (const lang of projectSeed.translationLanguages) allLanguages.add(lang);
  if (glossarySeed) {
    allLanguages.add(glossarySeed.glossary.sourceLanguage);
    allLanguages.add(glossarySeed.glossary.translationLanguage);
  }
  if (memorySeed) {
    for (const item of memorySeed.memory.items) {
      allLanguages.add(item.sourceLanguage);
      allLanguages.add(item.translationLanguage);
    }
  }
  await executeCommand(execCtx, ensureLanguages, {
    languageIds: [...allLanguages],
  });

  // ── 7. Project + root document ─────────────────────────────────────
  const project = await executeCommand(execCtx, createProject, {
    name: projectSeed.name,
    description: null,
    creatorId: userId,
  });
  refs.set("project", project.id);

  const rootDoc = await executeCommand(execCtx, createRootDocument, {
    projectId: project.id,
    creatorId: userId,
    name: "<root>",
  });
  refs.set("document:root", rootDoc.id);

  // ── 8. Glossary seeding ────────────────────────────────────────────
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
      await executeCommand(execCtx, createVectorizedStrings, {
        data: [{ text: conceptSeed.definition, languageId: g.sourceLanguage }],
      });

      const concept = await executeCommand(execCtx, createGlossaryConcept, {
        glossaryId,
        definition: conceptSeed.definition,
      });
      refs.set(conceptSeed.ref, concept.id);

      await executeCommand(execCtx, createGlossaryTerms, {
        glossaryId,
        creatorId: userId,
        data: conceptSeed.terms.map((t) => ({
          conceptId: concept.id,
          term: t.term,
          termLanguageId: t.termLanguageId,
          translation: t.translation,
          translationLanguageId: t.translationLanguageId,
          definition: conceptSeed.definition,
        })),
      });

      await buildTermRecallVariantsOp({ conceptId: concept.id });
    }
  }

  // ── 9. Memory seeding ──────────────────────────────────────────────
  let memoryId: string | undefined;
  if (memorySeed) {
    const m = memorySeed.memory;
    const memory = await executeCommand(execCtx, createMemory, {
      name: m.name,
      creatorId: userId,
      projectIds: [project.id],
    });
    memoryId = memory.id;
    refs.set("memory", memoryId);

    for (const itemSeed of m.items) {
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

      const items = await executeCommand(execCtx, createMemoryItems, {
        memoryId,
        items: [
          {
            translationId: null,
            translationStringId: translationStringIds[0],
            sourceStringId: sourceStringIds[0],
            creatorId: userId,
            sourceTemplate: null,
            translationTemplate: null,
            slotMapping: null,
          },
        ],
      });
      refs.set(itemSeed.ref, items[0].id);

      await buildMemoryRecallVariantsOp({
        memoryItemId: items[0].id,
        memoryId,
        sourceText: itemSeed.source,
        translationText: itemSeed.translation,
        sourceLanguageId: itemSeed.sourceLanguage,
        translationLanguageId: itemSeed.translationLanguage,
      });
    }
  }

  // ── 10. Element seeding ────────────────────────────────────────────
  let documentId: string | undefined = rootDoc?.id;
  if (elementsSeed) {
    for (const elSeed of elementsSeed.elements) {
      const stringIds = await executeCommand(execCtx, createVectorizedStrings, {
        data: [{ text: elSeed.text, languageId: projectSeed.sourceLanguage }],
      });

      const elementIds = await executeCommand(execCtx, createElements, {
        data: [
          {
            documentId: rootDoc.id,
            stringId: stringIds[0],
            creatorId: userId,
            meta: elSeed.meta as JSONType | undefined,
          },
        ],
      });
      refs.set(elSeed.ref, elementIds[0]);
    }
  }

  // ── 11. Vectorization with cache ───────────────────────────────────
  await vectorizeWithCache({
    execCtx,
    pluginManager,
    cache: new VectorCache(cacheDir),
    vectorizerOverride,
    dimension,
  });

  // ── 12. Agent definition registration ────────────────────────────
  let agentDefinitionId: string | undefined;
  if (config.seed.agentDefinition) {
    const agentDefValue = config.seed.agentDefinition;

    if (agentDefValue.endsWith(".md")) {
      // File-based agent definition — parse MD and create in DB
      const { parseAgentDefinition } = await import("@cat/agent");
      const { resolve: resolvePath } = await import("node:path");
      const { readFileSync, existsSync } = await import("node:fs");
      const mdPath = resolvePath(suite.suiteDir, agentDefValue);
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
        refs.set("agent-definition", agentDefinitionId);
      }
    }
  }

  return {
    db: testDb,
    redis,
    pluginManager,
    refs,
    projectId: project.id,
    glossaryId,
    memoryId,
    documentId,
    agentDefinitionId,
    userId,
    cleanup: async () => {
      await testDb.cleanup();
      redis.disconnect();
    },
  };
};

const getDimensionFromConfig = (
  override: PluginOverride | undefined,
): number | undefined => {
  if (!override) return undefined;
  const model = override.config?.["model-id"] ?? override.config?.model;
  if (typeof model !== "string") return undefined;
  const dimensionMap: Record<string, number> = {
    "text-embedding-3-small": 1536,
    "text-embedding-3-large": 3072,
    "text-embedding-ada-002": 1536,
  };
  // The openai-vectorizer plugin hardcodes dimensions: 1024 in the API call,
  // so any model accessed via it produces 1024-dimensional vectors unless
  // explicitly mapped to a different known dimension.
  return dimensionMap[model] ?? 1024;
};

const vectorizeWithCache = async (opts: {
  execCtx: ExecutorContext;
  pluginManager: PluginManager;
  cache: VectorCache;
  vectorizerOverride: PluginOverride | undefined;
  dimension: number;
}): Promise<void> => {
  const { execCtx, pluginManager, cache, vectorizerOverride, dimension } = opts;
  const modelName = (vectorizerOverride?.config?.model as string) ?? "unknown";

  const pm = resolvePluginManager(pluginManager);
  const vectorizerEntry = firstOrGivenService(pm, "TEXT_VECTORIZER");
  const storageEntry = firstOrGivenService(pm, "VECTOR_STORAGE");
  if (!vectorizerEntry || !storageEntry) {
    console.warn(
      "[eval] No vectorizer or storage service available — skipping vectorization",
    );
    return;
  }
  const vectorizer = vectorizerEntry.service;
  const storage = storageEntry.service;

  const db = execCtx.db;
  const pendingRows = await db.execute(
    sql`SELECT id, value, language_id FROM "VectorizedString" WHERE status = 'PENDING_VECTORIZE'`,
  );

  if (!pendingRows.rows || pendingRows.rows.length === 0) return;

  for (const row of pendingRows.rows) {
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
        });
        chunkDataArrays = result.map((r: unknown) =>
          Array.isArray(r) ? r : [r],
        ) as typeof chunkDataArrays;
        cache.set(modelName, text, languageId, chunkDataArrays, dimension);
      } catch (err) {
        const msg = String(err);
        if (msg.includes("dimension") || msg.includes("expected")) {
          console.warn(
            `[eval] Dimension mismatch for model "${modelName}" — invalidating cache`,
          );
          cache.invalidateModel(modelName);
        }
        console.error(`[eval] Failed to vectorize string ${stringId}:`, err);
        continue;
      }
    }

    try {
      const vectorizerPlugin = await db.execute(
        sql`SELECT id FROM "PluginService" WHERE service_type = 'TEXT_VECTORIZER' LIMIT 1`,
      );
      const storagePlugin = await db.execute(
        sql`SELECT id FROM "PluginService" WHERE service_type = 'VECTOR_STORAGE' LIMIT 1`,
      );
      const vectorizerId = (vectorizerPlugin.rows?.[0]?.id as number) ?? 1;
      const vectorStorageId = (storagePlugin.rows?.[0]?.id as number) ?? 1;

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
          vectorizerId,
          vectorStorageId,
          chunkSetCount: chunkDataArrays.length,
          chunks: flatChunks,
        },
      );

      const vectorPairs = chunkDataArrays.flatMap((chunks) =>
        chunks.map((chunk, i) => ({
          chunkId: chunkIds[i],
          vector: chunk.vector,
        })),
      );
      await storage.store({ chunks: vectorPairs });

      await executeCommand(execCtx, attachChunkSetToString, {
        updates: [{ stringId, chunkSetId: chunkSetIds[0] }],
      });
    } catch (err) {
      console.error(
        `[eval] Failed to store vectors for string ${stringId}:`,
        err,
      );
    }
  }

  cache.close();
};
