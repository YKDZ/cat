// oxlint-disable no-console -- intentional diagnostic logging in seed tool
// oxlint-disable no-await-in-loop -- seeder is intentionally sequential
// oxlint-disable typescript-eslint/no-unsafe-type-assertion -- raw SQL results require casting
import type { DrizzleClient, DrizzleTransaction } from "@cat/db";
import type { ExecutorContext } from "@cat/domain";
import type { PluginLoader } from "@cat/plugin-core";
import type { JSONType } from "@cat/shared/schema/json";

import {
  pluginInstallation,
  sql,
  eq,
  and,
  translatableElementContext,
} from "@cat/db";
import {
  addProjectTargetLanguages,
  attachChunkSetToString,
  createDocumentUnderParent,
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
  grantPermissionTuple,
  installPlugin,
  registerPluginDefinition,
  registerUserWithPasswordAccount,
  seedSystemRoles,
  upsertPluginConfigInstance,
} from "@cat/domain";
import {
  buildMemoryRecallVariantsOp,
  buildTermRecallVariantsOp,
} from "@cat/operations";
import { FileSystemPluginLoader, PluginManager } from "@cat/plugin-core";
import { firstOrGivenService, resolvePluginManager } from "@cat/server-shared";

import type { LoadedDevSeed } from "@/loader";
import type { PluginOverride } from "@/schemas";

import { RefResolver } from "@/ref-resolver";
import { VectorCache } from "@/vector-cache";

export type DevSeedResult = {
  refs: RefResolver;
  projectId: string;
  glossaryId: string | undefined;
  memoryId: string | undefined;
  documentId: string | undefined;
  userIds: string[];
  summary: SeedSummary;
};

export type SeedSummary = {
  users: number;
  projects: number;
  glossaryConcepts: number;
  memoryItems: number;
  elements: number;
  plugins: number;
};

export const runSeedPipeline = async (
  execCtx: ExecutorContext,
  loadedSeed: LoadedDevSeed,
  opts: {
    pluginsDir: string;
    defaultPluginsJsonPath: string;
    cacheDir: string;
    skipVectorization?: boolean;
  },
): Promise<DevSeedResult> => {
  const {
    config,
    projectSeed,
    userSeed,
    glossarySeed,
    memorySeed,
    elementsSeed,
  } = loadedSeed;
  const refs = new RefResolver();
  const summary: SeedSummary = {
    users: 0,
    projects: 0,
    glossaryConcepts: 0,
    memoryItems: 0,
    elements: 0,
    plugins: 0,
  };

  // ── 1. Plugin manager setup ────────────────────────────────────────
  PluginManager.clear();
  let loader: PluginLoader;
  if (config.plugins.loader === "test") {
    // Dynamic import of test-utils — only used in test environments
    // oxlint-disable-next-line typescript-eslint/no-unsafe-assignment, typescript-eslint/no-unsafe-member-access, typescript-eslint/no-unsafe-call
    const mod: { TestPluginLoader: new () => PluginLoader } = await import(
      "@cat/test-utils" as string
    );
    loader = new mod.TestPluginLoader();
  } else {
    loader = new FileSystemPluginLoader(opts.pluginsDir);
  }
  const pluginManager = PluginManager.get("GLOBAL", "", loader);

  // ── 2. Full app-like plugin bootstrap ──────────────────────────────
  // Mirror the app bootstrap sequence. syncDefinitions discovers all plugin
  // files, installDefaults registers/installs default plugins (including
  // password-auth-provider, vectorizers, etc.), and restore activates them.
  await pluginManager
    .getDiscovery()
    .syncDefinitions(execCtx.db as DrizzleClient);
  await PluginManager.installDefaults(
    execCtx.db as DrizzleClient,
    pluginManager,
    opts.defaultPluginsJsonPath,
  );
  await pluginManager.restore(execCtx.db as unknown as DrizzleTransaction);
  console.log(
    "[seed] Plugin bootstrap complete (syncDefinitions + installDefaults + restore).",
  );

  // ── 3. GLOBAL plugin config overrides ──────────────────────────────
  const globalOverrides = config.plugins.overrides.filter(
    (o) => o.scope === "GLOBAL",
  );
  const scopedOverrides = config.plugins.overrides.filter(
    (o) => o.scope !== "GLOBAL",
  );

  // Create a bootstrap user for config override creatorId
  const bootstrapUser = await executeCommand(execCtx, createUser, {
    email: "seed-bootstrap@internal",
    name: "Seed Bootstrap",
  });
  const bootstrapUserId = bootstrapUser.id;
  refs.set("user:bootstrap", bootstrapUserId);

  for (const override of globalOverrides) {
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
    // Skip install if already installed by installDefaults
    const existing = await execCtx.db
      .select({ id: pluginInstallation.id })
      .from(pluginInstallation)
      .where(
        and(
          eq(pluginInstallation.pluginId, data.id),
          eq(pluginInstallation.scopeType, override.scope),
          eq(pluginInstallation.scopeId, ""),
        ),
      );
    if (existing.length === 0) {
      await executeCommand(execCtx, installPlugin, {
        pluginId: data.id,
        scopeType: override.scope,
        scopeId: "",
      });
    }
    if (data.config !== undefined) {
      await executeCommand(execCtx, upsertPluginConfigInstance, {
        pluginId: override.plugin,
        scopeType: override.scope,
        scopeId: "",
        creatorId: bootstrapUserId,
        value: override.config,
      });
    }
    await pluginManager.reloadPlugin(execCtx.db, data.id);
    summary.plugins += 1;
  }

  // ── 4. Dimension reconciliation ────────────────────────────────────
  const vectorizerOverride = config.plugins.overrides.find(
    (o) => o.plugin === "openai-vectorizer" || o.plugin.includes("vectorizer"),
  );
  const dimension = getDimensionFromConfig(vectorizerOverride) ?? 1024;
  await execCtx.db.execute(sql`DROP TABLE IF EXISTS "Vector" CASCADE`);
  await executeCommand(execCtx, ensureVectorStorageSchema, { dimension });

  // ── 5. Languages ───────────────────────────────────────────────────
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

  // ── 6. Seed system roles + user accounts ───────────────────────────
  await executeCommand(execCtx, seedSystemRoles, {});

  const userIds: string[] = [];
  if (userSeed) {
    // Find PASSWORD auth provider ID
    const passwordServiceRow = await execCtx.db.execute(
      sql`SELECT id FROM "PluginService" WHERE service_id = 'PASSWORD' LIMIT 1`,
    );
    const authProviderId = passwordServiceRow.rows?.[0]?.id as number;
    if (!authProviderId) {
      throw new Error(
        "PASSWORD auth provider not found. Ensure password-auth-provider plugin is installed.",
      );
    }

    for (const u of userSeed.users) {
      const result = await executeCommand(
        execCtx,
        registerUserWithPasswordAccount,
        {
          email: u.email,
          name: u.name,
          password: u.password,
          authProviderId,
        },
      );
      refs.set(u.ref, result.userId);
      userIds.push(result.userId);
      summary.users += 1;

      if (u.role) {
        await executeCommand(execCtx, grantPermissionTuple, {
          subjectType: "user",
          subjectId: result.userId,
          relation: u.role,
          objectType: "system",
          objectId: "*",
        });
      }
    }
  }

  // ── 7. Project + root document ─────────────────────────────────────
  const creatorId = userIds[0] ?? bootstrapUserId;
  const project = await executeCommand(execCtx, createProject, {
    name: projectSeed.name,
    description: null,
    creatorId,
  });
  refs.set("project", project.id);
  summary.projects += 1;

  const rootDoc = await executeCommand(execCtx, createRootDocument, {
    projectId: project.id,
    creatorId,
    name: "<root>",
  });
  refs.set("document:root", rootDoc.id);

  await executeCommand(execCtx, addProjectTargetLanguages, {
    projectId: project.id,
    languageIds: projectSeed.translationLanguages,
  });

  const elementsDocName = elementsSeed?.documentName ?? "document";
  const enUsDoc = await createDocumentUnderParent(
    execCtx.db,
    {
      name: elementsDocName,
      projectId: project.id,
      creatorId,
      isDirectory: false,
    },
    rootDoc.id,
  );
  refs.set("document:elements", enUsDoc.id);

  // ── 8. Scoped plugin overrides ──────────────────────────────────────
  for (const override of scopedOverrides) {
    const resolvedScopeId = override.scopeId
      ? refs.resolve(override.scopeId)
      : "";
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
      scopeId: resolvedScopeId,
    });
    if (data.config !== undefined) {
      await executeCommand(execCtx, upsertPluginConfigInstance, {
        pluginId: override.plugin,
        scopeType: override.scope,
        scopeId: resolvedScopeId,
        creatorId: bootstrapUserId,
        value: override.config,
      });
    }
    await pluginManager.activate(execCtx.db, data.id);
    summary.plugins += 1;
  }

  // ── 9. Glossary seeding ────────────────────────────────────────────
  let glossaryId: string | undefined;
  if (glossarySeed) {
    const g = glossarySeed.glossary;
    const glossary = await executeCommand(execCtx, createGlossary, {
      name: g.name,
      creatorId,
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
      summary.glossaryConcepts += 1;

      await executeCommand(execCtx, createGlossaryTerms, {
        glossaryId,
        creatorId,
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

  // ── 10. Memory seeding ─────────────────────────────────────────────
  let memoryId: string | undefined;
  if (memorySeed) {
    const m = memorySeed.memory;
    const memory = await executeCommand(execCtx, createMemory, {
      name: m.name,
      creatorId,
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
            creatorId,
            sourceTemplate: null,
            translationTemplate: null,
            slotMapping: null,
          },
        ],
      });
      refs.set(itemSeed.ref, items[0].id);
      summary.memoryItems += 1;

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

  // ── 11. Element seeding ────────────────────────────────────────────
  if (elementsSeed) {
    for (const elSeed of elementsSeed.elements) {
      const stringIds = await executeCommand(execCtx, createVectorizedStrings, {
        data: [{ text: elSeed.text, languageId: projectSeed.sourceLanguage }],
      });

      const elementIds = await executeCommand(execCtx, createElements, {
        data: [
          {
            documentId: enUsDoc.id,
            stringId: stringIds[0],
            creatorId,
            meta: elSeed.meta as JSONType | undefined,
          },
        ],
      });

      if (elSeed.context !== undefined) {
        const contextPayloads = elSeed.context.map((contextItem) =>
          typeof contextItem === "string"
            ? {
                type: "TEXT" as const,
                textData: contextItem,
                translatableElementId: elementIds[0],
              }
            : {
                type: "JSON" as const,
                jsonData: contextItem as JSONType,
                translatableElementId: elementIds[0],
              },
        );

        await execCtx.db
          .insert(translatableElementContext)
          .values(contextPayloads);
      }

      refs.set(elSeed.ref, elementIds[0]);
      summary.elements += 1;
    }
  }

  // ── 12. Vectorization (optional) ───────────────────────────────────
  if (!opts.skipVectorization) {
    try {
      await vectorizeWithCache({
        execCtx,
        pluginManager,
        cache: new VectorCache(opts.cacheDir),
        vectorizerOverride,
        dimension,
      });
    } catch (err) {
      console.warn(
        "[seed] Vectorization failed (external services may be unavailable):",
        err,
      );
      console.warn("[seed] Continuing without vectorization.");
    }
  } else {
    console.log("[seed] Vectorization skipped (--skip-vectorization).");
  }

  return {
    refs,
    projectId: project.id,
    glossaryId,
    memoryId,
    documentId: rootDoc.id,
    userIds,
    summary,
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
      "[seed] No vectorizer or storage service available — skipping vectorization",
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
          // oxlint-disable-next-line typescript/no-unsafe-return
          Array.isArray(r) ? r : [r],
        ) as typeof chunkDataArrays;
        cache.set(modelName, text, languageId, chunkDataArrays, dimension);
      } catch (err) {
        const msg = String(err);
        if (msg.includes("dimension") || msg.includes("expected")) {
          console.warn(
            `[seed] Dimension mismatch for model "${modelName}" — invalidating cache`,
          );
          cache.invalidateModel(modelName);
        }
        console.error(`[seed] Failed to vectorize string ${stringId}:`, err);
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
        `[seed] Failed to store vectors for string ${stringId}:`,
        err,
      );
    }
  }

  cache.close();
};
