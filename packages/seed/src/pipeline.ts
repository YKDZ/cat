// oxlint-disable no-console -- intentional diagnostic logging in seed tool
// oxlint-disable no-await-in-loop -- seeder is intentionally sequential
// oxlint-disable typescript-eslint/no-unsafe-type-assertion -- raw SQL results require casting
import type { DrizzleClient } from "@cat/db";
import {
  and,
  agentDefinition,
  contentRelationType,
  contextEvidence,
  eq,
  inArray,
  language,
  plugin,
  pluginInstallation,
  pluginService,
  role,
  setting,
  sql,
  user,
} from "@cat/db";
import type { ExecutorContext } from "@cat/domain";
import {
  addProjectTargetLanguages,
  attachChunkSetToString,
  createContentNodeUnderParent,
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
  ensurePersonalProjectMemory,
  ensureCoreRelationTypes,
  ensureLanguages,
  executeCommand,
  executeQuery,
  grantPermissionTuple,
  installPlugin,
  registerPluginDefinition,
  registerUserWithPasswordAccount,
  seedSystemRoles,
  getPluginConfigInstance,
  getPluginConfigSchemaDigest,
  writePluginConfigInstance,
} from "@cat/domain";
import {
  startRecallDerivationWorker,
  waitForRecallDerivationFresh,
} from "@cat/operations";
import type { PluginLoader } from "@cat/plugin-core";
import {
  BuiltinPluginLoader,
  CompositePluginLoader,
  FileSystemPluginLoader,
  PluginManager,
} from "@cat/plugin-core";
import {
  defaultProductPluginIds,
  selectFirstServiceImplementation,
  resolvePluginManager,
  systemPgVectorEntry,
} from "@cat/server-shared";
import {
  CoreRelationTypeDefinitions,
  type JSONObject,
  type JSONType,
  type RecallDerivationReference,
  RequiredVectorDimension,
  ServiceImplementationReferenceSchema,
} from "@cat/shared";

import { runBootstrapSourceGraph } from "./bootstrap/source-bootstrap.ts";
import type { LoadedDevSeed } from "./loader.ts";
import { RefResolver } from "./ref-resolver.ts";
import type {
  MemoryContainerSeed,
  MemorySeed,
  PluginOverride,
} from "./schemas.ts";
import { VectorCache } from "./vector-cache.ts";

export type DevSeedResult = {
  refs: RefResolver;
  projectId: string;
  glossaryId: string | undefined;
  memoryId: string | undefined;
  contentNodeId: string | undefined;
  bootstrapReportPath?: string;
  bootstrap?: {
    elementIdsByRef: Record<string, number>;
    memoryId?: string;
  };
  userIds: string[];
  summary: SeedSummary;
};

export type SeedSummary = {
  users: number;
  projects: number;
  glossaryConcepts: number;
  memoryContainers: number;
  memoryItems: number;
  projectMemoryItems: number;
  personalMemoryItems: number;
  elements: number;
  plugins: number;
  bootstrapElements: number;
  bootstrapLocaleMemoryItems: number;
  bootstrapEvidence: number;
};

const assertFixtureHydrationPrerequisites = async (
  execCtx: ExecutorContext,
  requiredLanguageIds: readonly string[],
): Promise<void> => {
  const languages = await execCtx.db
    .select({ id: language.id })
    .from(language)
    .where(inArray(language.id, [...requiredLanguageIds]));
  const systemRoles = await execCtx.db
    .select({ name: role.name })
    .from(role)
    .where(inArray(role.name, ["superadmin", "admin", "user", "viewer"]));
  const passwordService = await execCtx.db
    .select({ id: pluginService.id })
    .from(pluginService)
    .where(eq(pluginService.serviceId, "PASSWORD"))
    .limit(1);
  const relationTypes = await execCtx.db
    .select({
      name: contentRelationType.name,
      namespace: contentRelationType.namespace,
      version: contentRelationType.version,
    })
    .from(contentRelationType);
  const rootAccount = await execCtx.db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, "admin@encmys.cn"))
    .limit(1);
  const requiredSetting = await execCtx.db
    .select({ key: setting.key })
    .from(setting)
    .where(eq(setting.key, "server.url"))
    .limit(1);
  const defaultPluginDefinitions = await execCtx.db
    .select({ id: plugin.id })
    .from(plugin)
    .where(inArray(plugin.id, defaultProductPluginIds));
  const defaultPluginInstallations = await execCtx.db
    .select({ id: pluginInstallation.id })
    .from(pluginInstallation)
    .where(
      and(
        eq(pluginInstallation.scopeType, "GLOBAL"),
        eq(pluginInstallation.scopeId, ""),
        inArray(pluginInstallation.pluginId, defaultProductPluginIds),
      ),
    );
  const builtinAgent = await execCtx.db
    .select({ id: agentDefinition.id })
    .from(agentDefinition)
    .where(
      and(
        eq(agentDefinition.definitionId, "translator"),
        eq(agentDefinition.scopeType, "GLOBAL"),
        eq(agentDefinition.scopeId, ""),
        eq(agentDefinition.isBuiltin, true),
      ),
    )
    .limit(1);

  const missingLanguages = requiredLanguageIds.filter(
    (id) => !languages.some((languageRow) => languageRow.id === id),
  );
  const missingRoles = ["superadmin", "admin", "user", "viewer"].filter(
    (name) => !systemRoles.some((roleRow) => roleRow.name === name),
  );
  const relationTypeKeys = new Set(
    relationTypes.map(
      (relationType) =>
        `${relationType.namespace}:${relationType.name}:${relationType.version}`,
    ),
  );
  const missingRelationTypes = CoreRelationTypeDefinitions.filter(
    (definition) =>
      !relationTypeKeys.has(
        `${definition.namespace}:${definition.name}:${definition.version}`,
      ),
  );

  const missing: string[] = [];
  if (missingLanguages.length > 0)
    missing.push(`languages (${missingLanguages.join(", ")})`);
  if (missingRoles.length > 0)
    missing.push(`system roles (${missingRoles.join(", ")})`);
  if (passwordService.length === 0) missing.push("PASSWORD plugin service");
  if (rootAccount.length === 0) missing.push("root account");
  if (requiredSetting.length === 0) missing.push("default settings");
  if (defaultPluginDefinitions.length !== defaultProductPluginIds.length)
    missing.push("default plugin definitions");
  if (defaultPluginInstallations.length !== defaultProductPluginIds.length)
    missing.push("default plugin installations");
  if (builtinAgent.length === 0) missing.push("builtin agents");
  if (missingRelationTypes.length > 0)
    missing.push("core content relation types");

  if (missing.length > 0) {
    throw new Error(
      `[fixture] Application-data bootstrap is incomplete: missing ${missing.join(", ")}. ` +
        "Prepare the schema and run application bootstrap before fixture hydration.",
    );
  }
};

const requireFirst = <T>(values: readonly T[], operation: string): T => {
  const value = values[0];
  if (value === undefined) {
    throw new Error(`${operation} returned no values`);
  }
  return value;
};

export const runSeedPipeline = async (
  execCtx: ExecutorContext,
  loadedSeed: LoadedDevSeed,
  opts: {
    pluginsDir: string;
    defaultPluginIds?: string[];
    defaultPluginsJsonPath?: string;
    pluginLoader?: PluginLoader;
    cacheDir: string;
    skipVectorization?: boolean;
    skipPluginBootstrap?: boolean;
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
    memoryContainers: 0,
    memoryItems: 0,
    projectMemoryItems: 0,
    personalMemoryItems: 0,
    elements: 0,
    plugins: 0,
    bootstrapElements: 0,
    bootstrapLocaleMemoryItems: 0,
    bootstrapEvidence: 0,
  };
  const skipPluginBootstrap = opts.skipPluginBootstrap === true;

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
    loader =
      opts.pluginLoader ??
      new CompositePluginLoader([
        new BuiltinPluginLoader([systemPgVectorEntry]),
        new FileSystemPluginLoader({ pluginsDir: opts.pluginsDir }),
      ]);
  }
  const pluginManager = PluginManager.get("GLOBAL", "", loader);

  // ── 2. Full app-like plugin bootstrap ──────────────────────────────
  // Mirror the app bootstrap sequence. syncDefinitions discovers all plugin
  // files, installDefaults registers/installs default plugins (including
  // password-auth-provider, vectorizers, etc.). GLOBAL overrides are applied
  // before restore so dynamic providers with required config do not activate
  // once with invalid default config.
  if (!skipPluginBootstrap) {
    await pluginManager
      .getDiscovery()
      .syncDefinitions(execCtx.db as DrizzleClient);
    const defaultPluginSource =
      opts.defaultPluginIds ?? opts.defaultPluginsJsonPath ?? [];
    await PluginManager.installDefaults(
      execCtx.db as DrizzleClient,
      pluginManager,
      defaultPluginSource,
    );
    console.log(
      "[seed] Plugin defaults installed (syncDefinitions + installDefaults).",
    );
  }

  // ── 3. GLOBAL plugin config overrides ──────────────────────────────
  const globalOverrides = config.plugins.overrides.filter(
    (o) => o.scope === "GLOBAL",
  );
  const scopedOverrides = config.plugins.overrides.filter(
    (o) => o.scope !== "GLOBAL",
  );

  if (
    skipPluginBootstrap &&
    (globalOverrides.length > 0 ||
      scopedOverrides.length > 0 ||
      config.bootstrap?.enabled ||
      !opts.skipVectorization)
  ) {
    throw new Error(
      "[seed] skipPluginBootstrap requires no plugin overrides, bootstrap disabled, and skipVectorization=true.",
    );
  }

  let bootstrapUserId: string | undefined;
  const createBootstrapUser = async (): Promise<void> => {
    const bootstrapUser = await executeCommand(execCtx, createUser, {
      email: "seed-bootstrap@internal",
      name: "Seed Bootstrap",
    });
    bootstrapUserId = bootstrapUser.id;
    refs.set("user:bootstrap", bootstrapUserId);
  };
  const requireBootstrapUserId = (): string => {
    if (bootstrapUserId === undefined) {
      throw new Error("Fixture bootstrap user was not initialized");
    }
    return bootstrapUserId;
  };

  if (!skipPluginBootstrap) await createBootstrapUser();

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
      configVersion: data.configVersion,
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
      if (!data.configVersion) {
        throw new Error(
          `Plugin ${data.id} declares config without configVersion`,
        );
      }
      const instance = await executeQuery(execCtx, getPluginConfigInstance, {
        pluginId: override.plugin,
        scopeType: override.scope,
        scopeId: "",
      });
      if (!instance)
        throw new Error(
          `Plugin ${override.plugin} config instance was not created`,
        );
      await executeCommand(execCtx, writePluginConfigInstance, {
        pluginId: override.plugin,
        scopeType: override.scope,
        scopeId: "",
        creatorId: requireBootstrapUserId(),
        value: override.config,
        expectedSchemaVersion: data.configVersion,
        expectedSchemaDigest: getPluginConfigSchemaDigest(data.config),
        expectedRevision: instance.revision,
      });
    }
    await pluginManager.reloadPlugin(execCtx.db, data.id);
    summary.plugins += 1;
  }

  if (!skipPluginBootstrap) {
    await pluginManager.restore(execCtx.db);
    console.log("[seed] Plugin restore complete.");
  }

  // ── 4. Vector storage selection ────────────────────────────────────
  if (
    !skipPluginBootstrap &&
    opts.defaultPluginIds?.includes("system-pgvector-storage")
  ) {
    const vectorStorageEntry = selectFirstServiceImplementation(
      pluginManager,
      "VECTOR_STORAGE",
    );
    if (
      !vectorStorageEntry ||
      vectorStorageEntry.reference.pluginId !== "system-pgvector-storage" ||
      vectorStorageEntry.reference.serviceId !== "native-pgvector"
    ) {
      throw new Error(
        "[seed] Expected system-pgvector-storage:native-pgvector to be the active vector storage service.",
      );
    }
  }

  const vectorizerOverride = config.plugins.overrides.find(
    (o) => o.plugin === "openai-vectorizer" || o.plugin.includes("vectorizer"),
  );
  // ── 5. Languages ───────────────────────────────────────────────────
  const allLanguages = new Set<string>();
  allLanguages.add(projectSeed.sourceLanguage);
  for (const lang of projectSeed.translationLanguages) allLanguages.add(lang);
  if (glossarySeed) {
    allLanguages.add(glossarySeed.glossary.sourceLanguage);
    allLanguages.add(glossarySeed.glossary.translationLanguage);
  }
  if (memorySeed) {
    for (const container of normalizeMemorySeed(memorySeed)) {
      for (const item of container.items) {
        allLanguages.add(item.sourceLanguage);
        allLanguages.add(item.translationLanguage);
      }
    }
  }
  if (config.bootstrap?.enabled) {
    allLanguages.add(config.bootstrap.sourceLanguageId);
    for (const lang of config.bootstrap.targetLanguageIds) {
      allLanguages.add(lang);
    }
    for (const catalog of config.bootstrap.localeCatalogs) {
      allLanguages.add(catalog.languageId);
    }
  }
  if (skipPluginBootstrap) {
    await assertFixtureHydrationPrerequisites(execCtx, [...allLanguages]);
    // Rehydrate the persisted application service configuration for fixture work.
    await pluginManager.restore(execCtx.db);
    console.log("[fixture] Restored installed application plugin state.");
    await createBootstrapUser();
  } else {
    await executeCommand(execCtx, ensureLanguages, {
      languageIds: [...allLanguages],
    });
    await executeCommand(execCtx, seedSystemRoles, {});
  }

  // ── 6. Fixture user accounts ───────────────────────────────────────

  const userIds: string[] = [];
  if (userSeed) {
    const authProvider = await execCtx.db
      .select({
        pluginId: pluginInstallation.pluginId,
        serviceId: pluginService.serviceId,
        serviceType: pluginService.serviceType,
        scopeType: pluginInstallation.scopeType,
        scopeId: pluginInstallation.scopeId,
      })
      .from(pluginService)
      .innerJoin(
        pluginInstallation,
        eq(pluginService.pluginInstallationId, pluginInstallation.id),
      )
      .where(eq(pluginService.serviceId, "PASSWORD"))
      .limit(1)
      .then((rows) => rows[0]);
    if (!authProvider) {
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
          authProvider:
            ServiceImplementationReferenceSchema.parse(authProvider),
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

  // ── 7. Project + root content node ────────────────────────────────
  const creatorId = userIds[0] ?? requireBootstrapUserId();
  const project = await executeCommand(execCtx, createProject, {
    name: projectSeed.name,
    description: null,
    creatorId,
  });
  await executeCommand(execCtx, grantPermissionTuple, {
    subjectType: "user",
    subjectId: creatorId,
    relation: "owner",
    objectType: "project",
    objectId: project.id,
  });

  // Grant additional project members defined in the seed
  if (projectSeed.members) {
    for (const member of projectSeed.members) {
      const memberId = refs.resolve(member.userRef);
      await executeCommand(execCtx, grantPermissionTuple, {
        subjectType: "user",
        subjectId: memberId,
        relation: member.relation,
        objectType: "project",
        objectId: project.id,
      });
    }
  }

  refs.set("project", project.id);
  summary.projects += 1;

  if (!skipPluginBootstrap) {
    await executeCommand(execCtx, ensureCoreRelationTypes, {});
  }

  const rootNode = await executeCommand(execCtx, createRootContentNode, {
    projectId: project.id,
    creatorId,
  });
  refs.set("content-node:root", rootNode.id);

  await executeCommand(execCtx, addProjectTargetLanguages, {
    projectId: project.id,
    languageIds: projectSeed.translationLanguages,
  });

  let bootstrapResult: DevSeedResult["bootstrap"];
  let bootstrapReportPath: string | undefined;
  if (config.bootstrap?.enabled) {
    const bootstrap = await runBootstrapSourceGraph({
      execCtx,
      pluginManager,
      seedDir: loadedSeed.seedDir,
      profileName: config.name,
      creatorId,
      projectId: project.id,
      sourceLanguageId: projectSeed.sourceLanguage,
      targetLanguageIds: projectSeed.translationLanguages,
      profile: config.bootstrap,
      skipVectorization: opts.skipVectorization ?? false,
    });
    bootstrapResult = {
      elementIdsByRef: bootstrap.elementIdsByRef,
      ...(bootstrap.memoryId === undefined
        ? {}
        : { memoryId: bootstrap.memoryId }),
    };
    bootstrapReportPath = bootstrap.reportPath;
    summary.bootstrapElements = Object.keys(bootstrap.elementIdsByRef).length;
    summary.bootstrapLocaleMemoryItems =
      bootstrap.report.locale.memoryItemCount;
    summary.bootstrapEvidence = bootstrap.report.source.evidenceCount;
    for (const [ref, id] of Object.entries(bootstrap.elementIdsByRef)) {
      refs.set(`element:${ref}`, id);
    }
    if (bootstrap.memoryId) {
      refs.set("memory:bootstrap-locale", bootstrap.memoryId);
    }
  }

  const elementsContentNodeLabel =
    elementsSeed?.contentNodeLabel ?? "content-node";
  const elementsNode = await executeCommand(
    execCtx,
    createContentNodeUnderParent,
    {
      projectId: project.id,
      creatorId,
      parentContentNodeId: rootNode.id,
      languageId: projectSeed.sourceLanguage,
      kind: "FILE",
      displayLabel: elementsContentNodeLabel,
      importerId: "seed",
      sourceRootRef: `project:${project.id}`,
      stableSourceNodeRef: elementsContentNodeLabel,
      exportRole: "FILE",
      boundaryType: "FILE",
      localOrder: 0,
    },
  );
  refs.set("content-node:elements", elementsNode.id);

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
      configVersion: data.configVersion,
    });
    await executeCommand(execCtx, installPlugin, {
      pluginId: data.id,
      scopeType: override.scope,
      scopeId: resolvedScopeId,
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
        scopeId: resolvedScopeId,
      });
      if (!instance)
        throw new Error(
          `Plugin ${override.plugin} config instance was not created`,
        );
      await executeCommand(execCtx, writePluginConfigInstance, {
        pluginId: override.plugin,
        scopeType: override.scope,
        scopeId: resolvedScopeId,
        creatorId: requireBootstrapUserId(),
        value: override.config,
        expectedSchemaVersion: data.configVersion,
        expectedSchemaDigest: getPluginConfigSchemaDigest(data.config),
        expectedRevision: instance.revision,
      });
    }
    await pluginManager.activate(execCtx.db, data.id);
    summary.plugins += 1;
  }

  // ── 9. Glossary seeding ────────────────────────────────────────────
  const recallDerivations: RecallDerivationReference[] = [];
  let glossaryId: string | undefined;
  if (glossarySeed) {
    const g = glossarySeed.glossary;
    const glossary = await executeCommand(execCtx, createGlossary, {
      name: g.name,
      creatorId,
      projectIds: [project.id],
    });
    await executeCommand(execCtx, grantPermissionTuple, {
      subjectType: "user",
      subjectId: creatorId,
      relation: "owner",
      objectType: "glossary",
      objectId: glossary.id,
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

      const created = await executeCommand(execCtx, createGlossaryTerms, {
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
      recallDerivations.push(...created.derivations);
    }
  }

  // ── 10. Memory seeding ─────────────────────────────────────────────
  let memoryId: string | undefined;
  if (memorySeed) {
    let defaultMemoryRefBound = false;

    for (const memorySeedContainer of normalizeMemorySeed(memorySeed)) {
      summary.memoryContainers += 1;

      const containerScope = memorySeedContainer.scope;
      let containerMemoryId: string;

      if (containerScope === "PROJECT") {
        const memory = await executeCommand(execCtx, createMemory, {
          name: memorySeedContainer.name,
          creatorId,
          scope: "PROJECT",
          projectIds: [project.id],
        });

        await executeCommand(execCtx, grantPermissionTuple, {
          subjectType: "user",
          subjectId: creatorId,
          relation: "owner",
          objectType: "memory",
          objectId: memory.id,
        });

        containerMemoryId = memory.id;
      } else {
        const ownerRef = memorySeedContainer.ownerRef;
        if (!ownerRef) {
          throw new Error("personal memory container requires ownerRef");
        }

        const ownerId = refs.resolve(ownerRef);
        const personalMemory = await executeCommand(
          execCtx,
          ensurePersonalProjectMemory,
          {
            userId: ownerId,
            projectId: project.id,
            name: memorySeedContainer.name,
          },
        );

        containerMemoryId = personalMemory.memoryId;
      }

      if (!memoryId || containerScope === "PROJECT") {
        memoryId = containerMemoryId;
      }

      if (memorySeedContainer.ref) {
        refs.set(memorySeedContainer.ref, containerMemoryId);
      }

      if (!defaultMemoryRefBound && memorySeedContainer.ref !== "memory") {
        refs.set("memory", containerMemoryId);
        defaultMemoryRefBound = true;
      } else if (memorySeedContainer.ref === "memory") {
        defaultMemoryRefBound = true;
      }

      for (const itemSeed of memorySeedContainer.items) {
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
              creatorId,
            },
          ],
        });
        const memoryItem = requireFirst(created.items, "create memory item");
        refs.set(itemSeed.ref, memoryItem.id);
        summary.memoryItems += 1;
        if (containerScope === "PROJECT") {
          summary.projectMemoryItems += 1;
        } else {
          summary.personalMemoryItems += 1;
        }

        recallDerivations.push(...created.derivations);
      }
    }
  }
  if (recallDerivations.length > 0) {
    const recallDerivationWorker = await startRecallDerivationWorker({
      db: execCtx.db,
      pluginManager,
    });
    try {
      await waitForRecallDerivationFresh(recallDerivations, {
        db: execCtx.db,
      });
    } finally {
      await recallDerivationWorker.stop();
    }
  }

  // ── 11. Element seeding ────────────────────────────────────────────
  if (elementsSeed) {
    for (const elSeed of elementsSeed.elements) {
      const stringIds = await executeCommand(execCtx, createVectorizedStrings, {
        data: [{ text: elSeed.text, languageId: projectSeed.sourceLanguage }],
      });

      const elIndex = elementsSeed.elements.indexOf(elSeed);
      const stringId = requireFirst(stringIds, "create element source string");
      const elementIds = await executeCommand(execCtx, createElements, {
        data: [
          {
            projectId: project.id,
            primaryContentNodeId: elementsNode.id,
            importerId: "seed",
            sourceRootRef: `project:${project.id}`,
            sourceNodeRef: elSeed.ref,
            stableSourceRef: elSeed.ref,
            stringId,
            creatorId,
            localOrder: elIndex,
            meta: elSeed.meta as JSONType | undefined,
          },
        ],
      });
      const elementId = requireFirst(elementIds, "create element");

      if (elSeed.context !== undefined) {
        const contextPayloads = elSeed.context.map((contextItem) =>
          typeof contextItem === "string"
            ? {
                projectId: project.id,
                attachedEndpointKind: "ELEMENT" as const,
                translatableElementId: elementId,
                kind: "TEXT" as const,
                trustLevel: "COLLECTED" as const,
                textData: contextItem,
              }
            : {
                projectId: project.id,
                attachedEndpointKind: "ELEMENT" as const,
                translatableElementId: elementId,
                kind: "JSON" as const,
                trustLevel: "COLLECTED" as const,
                jsonData: contextItem as JSONType,
              },
        );

        await execCtx.db.insert(contextEvidence).values(contextPayloads);
      }

      refs.set(elSeed.ref, elementId);
      summary.elements += 1;
    }
  }

  // ── 12. Vectorization (optional) ───────────────────────────────────
  if (!opts.skipVectorization) {
    await vectorizeWithCache({
      execCtx,
      pluginManager,
      cache: new VectorCache(opts.cacheDir),
      vectorizerOverride,
    });
  } else {
    console.log("[seed] Vectorization skipped (--skip-vectorization).");
  }

  return {
    refs,
    projectId: project.id,
    glossaryId,
    memoryId,
    contentNodeId: elementsNode.id,
    ...(bootstrapReportPath === undefined ? {} : { bootstrapReportPath }),
    ...(bootstrapResult === undefined ? {} : { bootstrap: bootstrapResult }),
    userIds,
    summary,
  };
};

/**
 * Hydrate deterministic business fixtures after schema preparation and application bootstrap.
 * The supplied options intentionally expose no schema or bootstrap capability.
 */
export const runFixtureHydration = async (
  execCtx: ExecutorContext,
  loadedSeed: LoadedDevSeed,
  options: Pick<
    Parameters<typeof runSeedPipeline>[2],
    | "cacheDir"
    | "defaultPluginIds"
    | "defaultPluginsJsonPath"
    | "pluginLoader"
    | "pluginsDir"
  >,
): Promise<DevSeedResult> => {
  return runSeedPipeline(execCtx, loadedSeed, {
    ...options,
    skipPluginBootstrap: true,
    skipVectorization: true,
  });
};

const isRecordConfig = (
  config: PluginOverride["config"] | undefined,
): config is JSONObject => {
  return (
    typeof config === "object" && config !== null && !Array.isArray(config)
  );
};

export const normalizeMemorySeed = (
  memorySeed: MemorySeed,
): MemoryContainerSeed[] => {
  const containers: MemoryContainerSeed[] = [];

  if (memorySeed.memory) {
    containers.push(memorySeed.memory);
  }

  if (memorySeed.memories?.length) {
    containers.push(...memorySeed.memories);
  }

  return containers;
};

const getVectorizerModelName = (
  override: PluginOverride | undefined,
): string => {
  if (!override || !isRecordConfig(override.config)) return "unknown";
  const model = override.config.model ?? override.config["model-id"];
  return typeof model === "string" ? model : "unknown";
};

export const vectorizeWithCache = async (opts: {
  execCtx: ExecutorContext;
  pluginManager: PluginManager;
  cache: VectorCache;
  vectorizerOverride: PluginOverride | undefined;
}): Promise<void> => {
  const { execCtx, pluginManager, cache, vectorizerOverride } = opts;
  const modelName = getVectorizerModelName(vectorizerOverride);

  const pm = resolvePluginManager(pluginManager);
  const vectorizerEntry = selectFirstServiceImplementation(
    pm,
    "TEXT_VECTORIZER",
  );
  const storageEntry = selectFirstServiceImplementation(pm, "VECTOR_STORAGE");
  if (!vectorizerEntry || !storageEntry) {
    throw new Error(
      "[seed] No vectorizer or storage service available. " +
        "Ensure the vectorizer plugin is configured, or pass --skip-vectorization to skip.",
    );
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
      const result = await vectorizer.vectorize({
        elements: [{ text, languageId }],
      });
      chunkDataArrays = result.map((r: unknown) =>
        // oxlint-disable-next-line typescript/no-unsafe-return
        Array.isArray(r) ? r : [r],
      ) as typeof chunkDataArrays;
    }

    if (
      chunkDataArrays.some((chunks) =>
        chunks.some((chunk) => chunk.vector.length !== RequiredVectorDimension),
      )
    ) {
      cache.invalidateModel(modelName);
      throw new Error(
        `[seed] Vectorizer model "${modelName}" returned vectors that do not match CAT's fixed ${RequiredVectorDimension}-dimension contract.`,
      );
    }
    if (!cached) cache.set(modelName, text, languageId, chunkDataArrays);

    {
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
    }
  }

  cache.close();
};
