import type {
  AgentLLMConfig,
  AgentPromptConfig,
  AgentConstraints,
  AgentSecurityPolicy,
  Orchestration,
} from "@cat/shared";
import type { _JSONSchema, JSONType, NonNullJSONType } from "@cat/shared";
import type { ProjectSettingPayload } from "@cat/shared";

import {
  PluginServiceTypeValues,
  ResourceTypeValues,
  ScopeTypeValues,
  TaskStatusValues,
  CommentReactionTypeValues,
  TranslatableElementContextTypeValues,
  CommentTargetTypeValues,
  TermTypeValues,
  TermStatusValues,
  AgentSessionStatusValues,
  AgentToolTargetValues,
  AgentToolConfirmationStatusValues,
  AgentSessionTrustPolicyValues,
  AgentDefinitionTypeValues,
  ObjectTypeValues,
  SubjectTypeValues,
  RelationValues,
  PermissionActionValues,
  MessageChannelValues,
  MessageCategoryValues,
  NotificationStatusValues,
  type NotificationStatus,
  ChangesetStatusValues,
  EntityTypeValues,
  ChangeActionValues,
  RiskLevelValues,
  ReviewStatusValues,
  AsyncStatusValues,
  ChangesetEntryAsyncStatusValues,
  RecallVariantTypeValues,
  RecallQuerySideValues,
  IssueStatusValues,
  PullRequestStatusValues,
  PullRequestTypeValues,
  EntityBranchStatusValues,
  IssueCommentTargetTypeValues,
  CrossReferenceSourceTypeValues,
  CrossReferenceTargetTypeValues,
  ContentNodeKindValues,
  ContentNodeLifecycleStatusValues,
  ContentNodeExportRoleValues,
  ContentBoundaryTypeValues,
  RelationEndpointKindValues,
  ContentRelationSemanticFamilyValues,
  ContentRelationDirectionalityValues,
  ContentRelationLifecycleStatusValues,
  EvidenceTrustLevelValues,
  ContentEvidenceKindValues,
  ContextConsumerPurposeValues,
  ScopeBindingAssetKindValues,
  ScopeBindingModeValues,
  SemanticDiffKindValues,
  VectorInvalidationReasonValues,
  ContentIdentityStatusValues,
  type ContentRelationAllowedEndpointPair,
  type ContextProfilePayload,
  type SemanticDiffEntryPayload,
} from "@cat/shared";
import { sql } from "drizzle-orm";
import {
  pgEnum,
  snakeCase,
  uuid,
  serial,
  text,
  integer,
  jsonb,
  boolean,
  timestamp,
  uniqueIndex,
  index,
  foreignKey,
  primaryKey,
  unique,
  check,
  bytea,
  type PgColumn,
} from "drizzle-orm/pg-core";

export const taskStatus = pgEnum("TaskStatus", TaskStatusValues);

export const pluginServiceType = pgEnum(
  "PluginServiceType",
  PluginServiceTypeValues,
);

export const scopeType = pgEnum("ScopeType", ScopeTypeValues);

export const translatableElementContextType = pgEnum(
  "TranslatableElementContextType",
  TranslatableElementContextTypeValues,
);

export const commentReactionType = pgEnum(
  "CommentReactionType",
  CommentReactionTypeValues,
);

export const resourceType = pgEnum("ResourceType", ResourceTypeValues);

export const commentTargetType = pgEnum(
  "CommentTargetType",
  CommentTargetTypeValues,
);

export const termType = pgEnum("TermType", TermTypeValues);

export const termStatus = pgEnum("TermStatus", TermStatusValues);

export const objectType = pgEnum("ObjectType", ObjectTypeValues);
export const subjectType = pgEnum("SubjectType", SubjectTypeValues);
export const relation = pgEnum("Relation", RelationValues);
export const permissionAction = pgEnum(
  "PermissionAction",
  PermissionActionValues,
);

export const messageChannel = pgEnum("MessageChannel", MessageChannelValues);
export const messageCategory = pgEnum("MessageCategory", MessageCategoryValues);
export const notificationStatus = pgEnum(
  "NotificationStatus",
  NotificationStatusValues,
);

export const changesetStatus = pgEnum("ChangeSetStatus", ChangesetStatusValues);
export const entityType = pgEnum("EntityType", EntityTypeValues);
export const changeAction = pgEnum("ChangeAction", ChangeActionValues);
export const riskLevel = pgEnum("RiskLevel", RiskLevelValues);
export const reviewStatus = pgEnum("ReviewStatus", ReviewStatusValues);
export const asyncStatus = pgEnum("AsyncStatus", AsyncStatusValues);
export const changesetEntryAsyncStatus = pgEnum(
  "ChangesetEntryAsyncStatus",
  ChangesetEntryAsyncStatusValues,
);

// ─── Issue + PR System ───

export const issueStatus = pgEnum("IssueStatus", IssueStatusValues);

export const pullRequestStatus = pgEnum(
  "PullRequestStatus",
  PullRequestStatusValues,
);

export const pullRequestType = pgEnum("PullRequestType", PullRequestTypeValues);

export const entityBranchStatus = pgEnum(
  "EntityBranchStatus",
  EntityBranchStatusValues,
);

export const issueCommentTargetType = pgEnum(
  "IssueCommentTargetType",
  IssueCommentTargetTypeValues,
);

export const crossReferenceSourceType = pgEnum(
  "CrossReferenceSourceType",
  CrossReferenceSourceTypeValues,
);

export const crossReferenceTargetType = pgEnum(
  "CrossReferenceTargetType",
  CrossReferenceTargetTypeValues,
);

// ─── Content Graph Enums ───

export const contentNodeKind = pgEnum("ContentNodeKind", ContentNodeKindValues);
export const contentNodeLifecycleStatus = pgEnum(
  "ContentNodeLifecycleStatus",
  ContentNodeLifecycleStatusValues,
);
export const contentNodeExportRole = pgEnum(
  "ContentNodeExportRole",
  ContentNodeExportRoleValues,
);
export const contentBoundaryType = pgEnum(
  "ContentBoundaryType",
  ContentBoundaryTypeValues,
);
export const relationEndpointKind = pgEnum(
  "RelationEndpointKind",
  RelationEndpointKindValues,
);
export const contentRelationSemanticFamily = pgEnum(
  "ContentRelationSemanticFamily",
  ContentRelationSemanticFamilyValues,
);
export const contentRelationDirectionality = pgEnum(
  "ContentRelationDirectionality",
  ContentRelationDirectionalityValues,
);
export const contentRelationLifecycleStatus = pgEnum(
  "ContentRelationLifecycleStatus",
  ContentRelationLifecycleStatusValues,
);
export const evidenceTrustLevel = pgEnum(
  "EvidenceTrustLevel",
  EvidenceTrustLevelValues,
);
export const contentEvidenceKind = pgEnum(
  "ContentEvidenceKind",
  ContentEvidenceKindValues,
);
export const contextConsumerPurpose = pgEnum(
  "ContextConsumerPurpose",
  ContextConsumerPurposeValues,
);
export const scopeBindingAssetKind = pgEnum(
  "ScopeBindingAssetKind",
  ScopeBindingAssetKindValues,
);
export const scopeBindingMode = pgEnum(
  "ScopeBindingMode",
  ScopeBindingModeValues,
);
export const semanticDiffKind = pgEnum(
  "SemanticDiffKind",
  SemanticDiffKindValues,
);
export const vectorInvalidationReason = pgEnum(
  "VectorInvalidationReason",
  VectorInvalidationReasonValues,
);
export const contentIdentityStatus = pgEnum(
  "ContentIdentityStatus",
  ContentIdentityStatusValues,
);

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
};

export const account = snakeCase.table(
  "Account",
  {
    id: serial().primaryKey(),
    providerIssuer: text().notNull(),
    providedAccountId: text().notNull(),
    meta: jsonb().$type<JSONType>(),

    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
    authProviderId: integer()
      .notNull()
      .references(() => pluginService.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),

    ...timestamps,
  },
  (table) => [unique().on(table.providerIssuer, table.providedAccountId)],
);

export const mfaProvider = snakeCase.table("MFAProvider", {
  id: serial().primaryKey(),
  failureCount: integer().notNull().default(0),
  lastUsedAt: timestamp({ withTimezone: true }),
  payload: jsonb().notNull().$type<NonNullJSONType>(),
  userId: uuid()
    .notNull()
    .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
  mfaServiceId: integer()
    .notNull()
    .references(() => pluginService.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),

  ...timestamps,
});

export const blob = snakeCase.table(
  "Blob",
  {
    id: serial().primaryKey(),
    key: text().notNull(),
    storageProviderId: integer()
      .notNull()
      .references(() => pluginService.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    referenceCount: integer().default(1).notNull(),
    hash: bytea(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique().on(table.hash),
    unique().on(table.storageProviderId, table.key),
    check("hash_check", sql`octet_length(${table.hash}) = 32`),
    check("referenceCount_check", sql`${table.referenceCount} >= 0`),
  ],
);

export const chunk = snakeCase.table(
  "Chunk",
  {
    id: serial().primaryKey(),
    meta: jsonb().$type<JSONType>(),
    chunkSetId: integer()
      .notNull()
      .references(() => chunkSet.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    vectorizerId: integer()
      .notNull()
      .references(() => pluginService.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    vectorStorageId: integer().notNull(),
    ...timestamps,
  },
  (table) => [index().using("btree", table.chunkSetId.asc().nullsLast())],
);

export const chunkSet = snakeCase.table("ChunkSet", {
  id: serial().primaryKey(),
  meta: jsonb().$type<JSONType>(),
  ...timestamps,
});

export const contentNode = snakeCase.table(
  "ContentNode",
  {
    id: uuid().defaultRandom().primaryKey(),
    projectId: uuid()
      .notNull()
      .references(() => project.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    creatorId: uuid().references(() => user.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    kind: contentNodeKind().notNull(),
    displayLabel: text().notNull(),
    importerId: text(),
    sourceRootRef: text(),
    stableSourceNodeRef: text(),
    sourceUri: text(),
    sourcePath: text(),
    sourceType: text(),
    languageId: text().references(() => language.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    exportRole: contentNodeExportRole().notNull().default("NONE"),
    boundaryType: contentBoundaryType().notNull().default("NONE"),
    fileHandlerId: integer().references(() => pluginService.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    fileId: integer().references(() => file.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    lifecycleStatus: contentNodeLifecycleStatus().notNull().default("ACTIVE"),
    provenance: jsonb().$type<JSONType>(),
    metadata: jsonb().$type<JSONType>(),
    ...timestamps,
  },
  (table) => [
    index().using("btree", table.projectId.asc().nullsLast()),
    index().using("btree", table.sourcePath.asc().nullsLast()),
    uniqueIndex()
      .on(
        table.projectId,
        table.importerId,
        table.sourceRootRef,
        table.stableSourceNodeRef,
      )
      .where(sql`${table.stableSourceNodeRef} IS NOT NULL`),
  ],
);

export const contentRelationType = snakeCase.table(
  "ContentRelationType",
  {
    id: serial().primaryKey(),
    namespace: text().notNull(),
    name: text().notNull(),
    version: text().notNull().default("1.0.0"),
    ownerPluginId: text().references(() => plugin.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    semanticFamily: contentRelationSemanticFamily().notNull(),
    allowedEndpointPairs: jsonb()
      .$type<ContentRelationAllowedEndpointPair[]>()
      .notNull(),
    directionality: contentRelationDirectionality()
      .notNull()
      .default("DIRECTED"),
    participatesInContainment: boolean().notNull().default(false),
    participatesInExport: boolean().notNull().default(false),
    supportsOrdering: boolean().notNull().default(false),
    weightingEligible: boolean().notNull().default(false),
    defaultTrustLevel: evidenceTrustLevel().notNull().default("COLLECTED"),
    deprecation: jsonb().$type<JSONType>(),
    migration: jsonb().$type<JSONType>(),
    metadata: jsonb().$type<JSONType>(),
    ...timestamps,
  },
  (table) => [unique().on(table.namespace, table.name, table.version)],
);

export const contentRelation = snakeCase.table(
  "ContentRelation",
  {
    id: uuid().defaultRandom().primaryKey(),
    projectId: uuid()
      .notNull()
      .references(() => project.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    relationTypeId: integer()
      .notNull()
      .references(() => contentRelationType.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    sourceEndpointKind: relationEndpointKind().notNull(),
    sourceNodeId: uuid().references(() => contentNode.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    sourceElementId: integer().references(() => translatableElement.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    targetEndpointKind: relationEndpointKind().notNull(),
    targetNodeId: uuid().references(() => contentNode.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    targetElementId: integer().references(() => translatableElement.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    isPrimary: boolean().notNull().default(false),
    localOrder: integer(),
    confidenceBasisPoints: integer().notNull().default(10000),
    lifecycleStatus: contentRelationLifecycleStatus()
      .notNull()
      .default("ACTIVE"),
    weightHint: jsonb().$type<JSONType>(),
    provenance: jsonb().$type<JSONType>(),
    validationMetadata: jsonb().$type<JSONType>(),
    ...timestamps,
  },
  (table) => [
    index().using("btree", table.projectId.asc().nullsLast()),
    index().using("btree", table.relationTypeId.asc().nullsLast()),
    index().using("btree", table.sourceNodeId.asc().nullsLast()),
    index().using("btree", table.targetNodeId.asc().nullsLast()),
    index().using("btree", table.sourceElementId.asc().nullsLast()),
    index().using("btree", table.targetElementId.asc().nullsLast()),
    uniqueIndex()
      .on(table.projectId, table.targetNodeId)
      .where(
        sql`${table.isPrimary} = true AND ${table.targetEndpointKind} = 'NODE' AND ${table.lifecycleStatus} = 'ACTIVE'`,
      ),
    uniqueIndex()
      .on(table.projectId, table.targetElementId)
      .where(
        sql`${table.isPrimary} = true AND ${table.targetEndpointKind} = 'ELEMENT' AND ${table.lifecycleStatus} = 'ACTIVE'`,
      ),
    check(
      "contentRelation_source_endpoint_check",
      sql`(
        (${table.sourceEndpointKind} = 'NODE' AND ${table.sourceNodeId} IS NOT NULL AND ${table.sourceElementId} IS NULL)
        OR (${table.sourceEndpointKind} = 'ELEMENT' AND ${table.sourceElementId} IS NOT NULL AND ${table.sourceNodeId} IS NULL)
      )`,
    ),
    check(
      "contentRelation_target_endpoint_check",
      sql`(
        (${table.targetEndpointKind} = 'NODE' AND ${table.targetNodeId} IS NOT NULL AND ${table.targetElementId} IS NULL)
        OR (${table.targetEndpointKind} = 'ELEMENT' AND ${table.targetElementId} IS NOT NULL AND ${table.targetNodeId} IS NULL)
      )`,
    ),
    check(
      "contentRelation_confidence_check",
      sql`${table.confidenceBasisPoints} BETWEEN 0 AND 10000`,
    ),
  ],
);

export const contentNodeToTask = snakeCase.table(
  "ContentNodeToTask",
  {
    contentNodeId: uuid()
      .notNull()
      .references(() => contentNode.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    taskId: uuid()
      .notNull()
      .references(() => task.id, { onDelete: "cascade", onUpdate: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.contentNodeId, table.taskId] }),
    index().using("btree", table.taskId.asc().nullsLast()),
  ],
);

export const file = snakeCase.table("File", {
  id: serial().primaryKey(),
  name: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  blobId: integer()
    .notNull()
    .references(() => blob.id, { onDelete: "restrict", onUpdate: "cascade" }),
  isActive: boolean().default(true).notNull(),
});

export const glossary = snakeCase.table("Glossary", {
  id: uuid().defaultRandom().primaryKey(),
  name: text().notNull(),
  description: text(),
  creatorId: uuid()
    .notNull()
    .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
  ...timestamps,
});

export const glossaryToProject = snakeCase.table(
  "GlossaryToProject",
  {
    glossaryId: uuid()
      .notNull()
      .references(() => glossary.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    projectId: uuid()
      .notNull()
      .references(() => project.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    primaryKey({
      columns: [table.glossaryId, table.projectId],
    }),
    index().using("btree", table.projectId.asc().nullsLast()),
  ],
);

export const language = snakeCase.table("Language", {
  id: text().primaryKey(),
});

export const memory = snakeCase.table("Memory", {
  id: uuid().defaultRandom().primaryKey(),
  name: text().notNull(),
  description: text(),
  creatorId: uuid()
    .notNull()
    .references(() => user.id, { onDelete: "restrict", onUpdate: "cascade" }),
  ...timestamps,
});

export const memoryItem = snakeCase.table("MemoryItem", {
  id: serial().primaryKey(),
  creatorId: uuid().references(() => user.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  memoryId: uuid()
    .notNull()
    .references(() => memory.id, { onDelete: "cascade", onUpdate: "cascade" }),
  sourceElementId: integer().references(() => translatableElement.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  translationId: integer().references(() => translation.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  sourceStringId: integer()
    .notNull()
    .references(() => vectorizedString.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
  translationStringId: integer()
    .notNull()
    .references(() => vectorizedString.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
  /** Placeholderized source text template, e.g. "Error Code: {NUM_0}" */
  sourceTemplate: text(),
  /** Placeholderized translation text template */
  translationTemplate: text(),
  /** JSON mapping of placeholder → original value + token type */
  slotMapping: jsonb().$type<JSONType>(),
  ...timestamps,
});

export const memoryToProject = snakeCase.table(
  "MemoryToProject",
  {
    memoryId: uuid()
      .notNull()
      .references(() => memory.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    projectId: uuid()
      .notNull()
      .references(() => project.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    primaryKey({
      columns: [table.memoryId, table.projectId],
    }),
    index().using("btree", table.projectId.asc().nullsLast()),
  ],
);

export const plugin = snakeCase.table("Plugin", {
  id: text().primaryKey(),
  name: text().notNull(),
  overview: text(),
  isExternal: boolean().default(false).notNull(),
  entry: text().notNull(),
  iconUrl: text(),
  version: text().notNull(),
  ...timestamps,
});

export const pluginConfig = snakeCase.table(
  "PluginConfig",
  {
    id: serial().primaryKey(),
    pluginId: text()
      .notNull()
      .references(() => plugin.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    schema: jsonb().notNull().$type<_JSONSchema>(),
    ...timestamps,
  },
  (table) => [uniqueIndex().using("btree", table.pluginId.asc().nullsLast())],
);

export const pluginConfigInstance = snakeCase.table(
  "PluginConfigInstance",
  {
    id: serial().primaryKey(),
    value: jsonb().notNull().$type<NonNullJSONType>(),
    creatorId: uuid().references(() => user.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    configId: integer()
      .notNull()
      .references(() => pluginConfig.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    pluginInstallationId: integer()
      .notNull()
      .references(() => pluginInstallation.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex().using(
      "btree",
      table.pluginInstallationId.asc().nullsLast(),
      table.configId.asc().nullsLast(),
    ),
  ],
);

export const pluginInstallation = snakeCase.table(
  "PluginInstallation",
  {
    id: serial().primaryKey(),
    scopeId: text().notNull(),
    pluginId: text()
      .notNull()
      .references(() => plugin.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    scopeMeta: jsonb().$type<JSONType>(),
    scopeType: scopeType().notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex().using(
      "btree",
      table.scopeType.asc().nullsLast(),
      table.scopeId.asc().nullsLast(),
      table.pluginId.asc().nullsLast(),
    ),
  ],
);

export const pluginService = snakeCase.table(
  "PluginService",
  {
    id: serial().primaryKey(),
    serviceId: text().notNull(),
    pluginInstallationId: integer()
      .notNull()
      .references(() => pluginInstallation.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    serviceType: pluginServiceType().notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex().using(
      "btree",
      table.serviceType.asc().nullsLast(),
      table.serviceId.asc().nullsLast(),
      table.pluginInstallationId.asc().nullsLast(),
    ),
  ],
);

export const pluginComponent = snakeCase.table("PluginComponent", {
  id: serial().primaryKey(),
  componentId: text().notNull(),
  slot: text().notNull(),
  url: text().notNull(),
  pluginInstallationId: integer()
    .notNull()
    .references(() => pluginInstallation.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  ...timestamps,
});

export const project = snakeCase.table(
  "Project",
  {
    id: uuid().defaultRandom().primaryKey(),
    name: text().notNull(),
    description: text(),
    creatorId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "restrict", onUpdate: "cascade" }),
    /** Feature flags for Issue + PR system */
    features: jsonb()
      .$type<{ issues: boolean; pullRequests: boolean }>()
      .notNull()
      .default({ issues: false, pullRequests: false }),
    ...timestamps,
  },
  (table) => [index().using("btree", table.creatorId.asc().nullsLast())],
);

export const projectSetting = snakeCase.table(
  "ProjectSetting",
  {
    id: serial().primaryKey(),
    projectId: uuid()
      .notNull()
      .references(() => project.id, { onDelete: "cascade" })
      .unique(),
    settings: jsonb().$type<ProjectSettingPayload>().notNull().default({
      enableAutoTranslation: false,
      autoTranslationLanguages: [],
    }),
    ...timestamps,
  },
  (table) => [index().on(table.projectId)],
);

export const contextProfile = snakeCase.table(
  "ContextProfile",
  {
    id: uuid().defaultRandom().primaryKey(),
    projectId: uuid()
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    name: text().notNull(),
    payload: jsonb().$type<ContextProfilePayload>().notNull(),
    isDefault: boolean().notNull().default(false),
    ...timestamps,
  },
  (table) => [
    unique().on(table.projectId, table.name),
    uniqueIndex()
      .on(table.projectId)
      .where(sql`${table.isDefault} = true`),
  ],
);

export const scopeBinding = snakeCase.table(
  "ScopeBinding",
  {
    id: serial().primaryKey(),
    projectId: uuid()
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    assetKind: scopeBindingAssetKind().notNull(),
    assetId: text().notNull(),
    mode: scopeBindingMode().notNull(),
    contentNodeId: uuid().references(() => contentNode.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    contentRelationId: uuid().references(() => contentRelation.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    weightBoost: integer().notNull().default(0),
    metadata: jsonb().$type<JSONType>(),
    ...timestamps,
  },
  (table) => [
    index().on(table.projectId, table.assetKind, table.assetId),
    check(
      "scopeBinding_scope_check",
      sql`(
        (${table.contentNodeId} IS NOT NULL AND ${table.contentRelationId} IS NULL)
        OR (${table.contentNodeId} IS NULL AND ${table.contentRelationId} IS NOT NULL)
      )`,
    ),
  ],
);

export const projectSequence = snakeCase.table(
  "ProjectSequence",
  {
    id: serial().primaryKey(),
    projectId: uuid()
      .notNull()
      .unique()
      .references(() => project.id, { onDelete: "cascade" }),
    nextValue: integer().notNull().default(1),
  },
  (table) => [uniqueIndex().on(table.projectId)],
);

// ─── Issue System ───

export const issue = snakeCase.table(
  "Issue",
  {
    id: serial().primaryKey(),
    externalId: uuid().defaultRandom().notNull().unique(),
    projectId: uuid()
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    number: integer().notNull(),
    title: text().notNull(),
    body: text().notNull().default(""),
    status: issueStatus().notNull().default("OPEN"),
    authorId: uuid().references(() => user.id, { onDelete: "set null" }),
    authorAgentId: integer().references(() => agentDefinition.id, {
      onDelete: "set null",
    }),
    assignees: jsonb()
      .$type<Array<{ type: "user" | "agent"; id: string }>>()
      .notNull()
      .default([]),
    claimPolicy: jsonb().$type<{
      rules: Array<{ type: "agent" | "role" | "user"; id: string }>;
    } | null>(),
    parentIssueId: integer(),
    closedAt: timestamp({ withTimezone: true }),
    closedByPRId: integer(),
    metadata: jsonb().$type<JSONType>(),
    ...timestamps,
  },
  (table) => [
    index().on(table.projectId),
    uniqueIndex().on(table.projectId, table.number),
    index().on(table.projectId, table.status),
    index().on(table.parentIssueId),
    foreignKey({
      columns: [table.parentIssueId],
      foreignColumns: [table.id],
    })
      .onUpdate("cascade")
      .onDelete("set null"),
  ],
);

export const issueLabel = snakeCase.table(
  "IssueLabel",
  {
    issueId: integer()
      .notNull()
      .references(() => issue.id, { onDelete: "cascade" }),
    label: text().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.issueId, table.label] }),
    index().on(table.label),
  ],
);

// ─── Pull Request System ───

export const pullRequest = snakeCase.table(
  "PullRequest",
  {
    id: serial().primaryKey(),
    externalId: uuid().defaultRandom().notNull().unique(),
    projectId: uuid()
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    number: integer().notNull(),
    title: text().notNull(),
    body: text().notNull().default(""),
    status: pullRequestStatus().notNull().default("DRAFT"),
    authorId: uuid().references(() => user.id, { onDelete: "set null" }),
    authorAgentId: integer().references(() => agentDefinition.id, {
      onDelete: "set null",
    }),
    branchId: integer()
      .notNull()
      .references(() => entityBranch.id, { onDelete: "restrict" }),
    issueId: integer().references(() => issue.id, { onDelete: "set null" }),
    reviewers: jsonb()
      .$type<Array<{ type: "user" | "agent"; id: string }>>()
      .notNull()
      .default([]),
    mergedAt: timestamp({ withTimezone: true }),
    mergedBy: text(),
    metadata: jsonb().$type<JSONType>(),
    type: pullRequestType().notNull().default("MANUAL"),
    targetLanguageId: text(),
    ...timestamps,
  },
  (table) => [
    index().on(table.projectId),
    uniqueIndex().on(table.projectId, table.number),
    index().on(table.branchId),
    index().on(table.issueId),
    index().on(table.projectId, table.status),
    index().on(table.projectId, table.type, table.targetLanguageId),
    uniqueIndex()
      .on(table.projectId, table.targetLanguageId)
      .where(
        sql`"type" = 'AUTO_TRANSLATE' AND "status" NOT IN ('MERGED', 'CLOSED')`,
      ),
  ],
);

// ─── Issue/PR Comment System (独立于翻译评论) ───

export const issueCommentThread = snakeCase.table(
  "IssueCommentThread",
  {
    id: serial().primaryKey(),
    externalId: uuid().defaultRandom().notNull().unique(),
    targetType: issueCommentTargetType().notNull(),
    targetId: integer().notNull(),
    isReviewThread: boolean().notNull().default(false),
    isResolved: boolean().notNull().default(false),
    reviewContext: jsonb().$type<{
      entityType: string;
      entityId: string;
      fieldPath: string;
      changesetEntryId: number;
    } | null>(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index().on(table.targetType, table.targetId),
    index().on(table.targetType, table.targetId, table.isReviewThread),
  ],
);

export const issueComment = snakeCase.table(
  "IssueComment",
  {
    id: serial().primaryKey(),
    externalId: uuid().defaultRandom().notNull().unique(),
    threadId: integer()
      .notNull()
      .references(() => issueCommentThread.id, { onDelete: "cascade" }),
    body: text().notNull(),
    authorId: uuid().references(() => user.id, { onDelete: "set null" }),
    authorAgentId: integer().references(() => agentDefinition.id, {
      onDelete: "set null",
    }),
    editedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index().on(table.threadId, table.createdAt)],
);

// ─── Cross Reference ───

export const crossReference = snakeCase.table(
  "CrossReference",
  {
    id: serial().primaryKey(),
    sourceType: crossReferenceSourceType().notNull(),
    sourceId: integer().notNull(),
    targetType: crossReferenceTargetType().notNull(),
    targetId: integer().notNull(),
    projectId: uuid()
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index().on(table.targetType, table.targetId),
    index().on(table.sourceType, table.sourceId),
    unique().on(
      table.sourceType,
      table.sourceId,
      table.targetType,
      table.targetId,
    ),
  ],
);

export const projectTargetLanguage = snakeCase.table(
  "ProjectTargetLanguage",
  {
    languageId: text()
      .notNull()
      .references(() => language.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    projectId: uuid()
      .notNull()
      .references(() => project.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    primaryKey({
      columns: [table.languageId, table.projectId],
    }),
    index().using("btree", table.projectId.asc().nullsLast()),
  ],
);

export const setting = snakeCase.table(
  "Setting",
  {
    id: serial().primaryKey(),
    key: text().notNull(),
    value: jsonb().notNull().$type<NonNullJSONType>(),
    ...timestamps,
  },
  (table) => [uniqueIndex().using("btree", table.key.asc().nullsLast())],
);

export const task = snakeCase.table(
  "Task",
  {
    id: uuid().defaultRandom().primaryKey(),
    status: taskStatus().default("PENDING").notNull(),
    type: text().notNull(),
    meta: jsonb().$type<JSONType>(),
    ...timestamps,
  },
  (table) => [index().using("btree", table.meta.asc().nullsLast())],
);

export const term = snakeCase.table(
  "Term",
  {
    id: serial().primaryKey(),
    type: termType().notNull().default("NOT_SPECIFIED"),
    status: termStatus().notNull().default("NOT_SPECIFIED"),
    creatorId: uuid().references(() => user.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    text: text().notNull(),
    languageId: text()
      .notNull()
      .references(() => language.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    termConceptId: integer()
      .notNull()
      .references(() => termConcept.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    ...timestamps,
  },
  (table) => [
    unique().on(table.languageId, table.text, table.termConceptId),
    // pg_trgm GIN index for fast bidirectional ILIKE matching (term.lookup)
    index("idx_term_text_trgm").using("gin", sql`${table.text} gin_trgm_ops`),
  ],
);

export const termConcept = snakeCase.table("TermConcept", {
  id: serial().primaryKey(),
  definition: text(),
  stringId: integer().references(() => vectorizedString.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  creatorId: uuid().references(() => user.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  glossaryId: uuid()
    .notNull()
    .references(() => glossary.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  ...timestamps,
});

export const termConceptToSubject = snakeCase.table(
  "TermConceptToSubject",
  {
    termConceptId: integer()
      .notNull()
      .references(() => termConcept.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    subjectId: integer()
      .notNull()
      .references(() => termConceptSubject.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    isPrimary: boolean().notNull().default(false),
  },
  (table) => [
    primaryKey({
      columns: [table.termConceptId, table.subjectId],
    }),
  ],
);

export const termConceptSubject = snakeCase.table("TermConceptSubject", {
  id: serial().primaryKey(),
  subject: text().notNull(),
  defaultDefinition: text(),
  creatorId: uuid().references(() => user.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  glossaryId: uuid().references(() => glossary.id, {
    onDelete: "cascade",
    onUpdate: "cascade",
  }),
  ...timestamps,
});

export const translatableElement = snakeCase.table(
  "TranslatableElement",
  {
    id: serial().primaryKey(),

    /**
     * 元素的元数据，被 file-importer 和 exporter 用于从元素还原源文件\
     * 本身也是一种重要的上下文，例如对于 json 文件，一般都有一个近似语义化的 key
     */
    projectId: uuid()
      .notNull()
      .references(() => project.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    importerId: text().notNull(),
    sourceRootRef: text().notNull(),
    sourceNodeRef: text().notNull(),
    stableSourceRef: text().notNull(),
    identityStatus: contentIdentityStatus().notNull().default("ACTIVE"),
    identityConfidence: integer().notNull().default(10000),
    meta: jsonb().$type<JSONType>(),

    /**
     * 元素的排序方式，用于确定元素在编辑器中的展示顺序以及提供 “邻居上下文”\
     * 即在翻译过程中可以表示后相邻的元素内容，帮助译者理解上下文进行更准确的翻译\
     * 应该重视而不是随便指定，要确保它可以将互为参考的文本聚合在一起
     */
    sourceStartLine: integer(),
    sourceEndLine: integer(),
    sourceLocationMeta: jsonb().$type<JSONType>(),

    creatorId: uuid().references(() => user.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    vectorizedStringId: integer()
      .notNull()
      .references(() => vectorizedString.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    approvedTranslationId: integer().references(
      (): PgColumn => translation.id,
      {
        onDelete: "set null",
        onUpdate: "cascade",
      },
    ),
    ...timestamps,
  },
  (table) => [
    unique().on(
      table.projectId,
      table.importerId,
      table.sourceRootRef,
      table.sourceNodeRef,
      table.stableSourceRef,
    ),
    index().using("btree", table.projectId.asc().nullsLast()),
    index().using("btree", table.vectorizedStringId.asc().nullsLast()),
    check(
      "translatableElement_identityConfidence_check",
      sql`${table.identityConfidence} BETWEEN 0 AND 10000`,
    ),
  ],
);

export const comment = snakeCase.table(
  "Comment",
  {
    id: serial().primaryKey(),
    targetType: commentTargetType().notNull(),
    targetId: integer().notNull(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
    content: text().notNull(),
    parentCommentId: integer(),
    rootCommentId: integer(),
    languageId: text()
      .notNull()
      .references(() => language.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.parentCommentId],
      foreignColumns: [table.id],
    })
      .onUpdate("cascade")
      .onDelete("set null"),
    foreignKey({
      columns: [table.rootCommentId],
      foreignColumns: [table.id],
    })
      .onUpdate("cascade")
      .onDelete("set null"),
    index().using("btree", table.parentCommentId.asc().nullsLast()),
    index().using("btree", table.rootCommentId.asc().nullsLast()),
    index().using("btree", table.userId.asc().nullsLast()),
    index().on(table.targetType, table.targetId),
  ],
);

export const commentReaction = snakeCase.table(
  "CommentReaction",
  {
    id: serial().primaryKey(),
    commentId: integer()
      .notNull()
      .references(() => comment.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
    type: commentReactionType().notNull(),
    ...timestamps,
  },
  (table) => [
    // Default index name over 63 bytes
    index().using("btree", table.commentId.asc().nullsLast()),
    index().using("btree", table.userId.asc().nullsLast()),
    unique().on(table.commentId, table.userId),
  ],
);

export const contextEvidence = snakeCase.table(
  "ContextEvidence",
  {
    id: serial().primaryKey(),
    projectId: uuid()
      .notNull()
      .references(() => project.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    attachedEndpointKind: text().notNull(),
    contentNodeId: uuid().references(() => contentNode.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    contentRelationId: uuid().references(() => contentRelation.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    translatableElementId: integer().references(() => translatableElement.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    kind: contentEvidenceKind().notNull(),
    trustLevel: evidenceTrustLevel().notNull().default("COLLECTED"),
    freshnessAt: timestamp({ withTimezone: true }),
    jsonData: jsonb().$type<JSONType>(),
    fileId: integer().references(() => file.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    storageProviderId: integer().references(() => pluginService.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    textData: text(),
    displayLabel: text(),
    provenance: jsonb().$type<JSONType>(),
    graphExplanation: jsonb().$type<JSONType>(),
    ...timestamps,
  },
  (table) => [
    index().using("btree", table.projectId.asc().nullsLast()),
    index().using("btree", table.contentNodeId.asc().nullsLast()),
    index().using("btree", table.contentRelationId.asc().nullsLast()),
    index().using("btree", table.translatableElementId.asc().nullsLast()),
    check(
      "contextEvidence_endpoint_check",
      sql`(
        (${table.attachedEndpointKind} = 'NODE' AND ${table.contentNodeId} IS NOT NULL AND ${table.contentRelationId} IS NULL AND ${table.translatableElementId} IS NULL)
        OR (${table.attachedEndpointKind} = 'RELATION' AND ${table.contentRelationId} IS NOT NULL AND ${table.contentNodeId} IS NULL AND ${table.translatableElementId} IS NULL)
        OR (${table.attachedEndpointKind} = 'ELEMENT' AND ${table.translatableElementId} IS NOT NULL AND ${table.contentNodeId} IS NULL AND ${table.contentRelationId} IS NULL)
      )`,
    ),
  ],
);

export const vectorizedString = snakeCase.table(
  "VectorizedString",
  {
    id: serial().primaryKey(),
    value: text().notNull(),
    languageId: text()
      .notNull()
      .references(() => language.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    chunkSetId: integer().references(() => chunkSet.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    status: text().notNull().default("PENDING_VECTORIZE"),
  },
  (table) => [
    unique().on(table.languageId, table.value),
    // pg_trgm GIN index for fast bidirectional ILIKE matching (term.lookup)
    index("idx_vectorized_string_value_trgm").using(
      "gin",
      sql`${table.value} gin_trgm_ops`,
    ),
    index("idx_vectorized_string_value_en_bm25_rum")
      .using(
        "rum",
        sql`to_tsvector('english', ${table.value}) rum_tsvector_ops`,
      )
      .where(sql`${table.languageId} = 'en'`),
    index("idx_vectorized_string_value_zh_hans_bm25_rum")
      .using(
        "rum",
        sql`to_tsvector('cat_zh_hans', ${table.value}) rum_tsvector_ops`,
      )
      .where(sql`${table.languageId} = 'zh-Hans'`),
    // Index for faster language lookup
    index().using("btree", table.languageId.asc().nullsLast()),
    // Index for status-based filtering
    index().using("btree", table.status.asc().nullsLast()),
  ],
);

export const translation = snakeCase.table(
  "Translation",
  {
    id: serial().primaryKey(),
    translatorId: uuid().references(() => user.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    translatableElementId: integer()
      .notNull()
      .references(() => translatableElement.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    meta: jsonb().$type<JSONType>(),
    stringId: integer()
      .notNull()
      .references(() => vectorizedString.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex().using(
      "btree",
      table.translatorId.asc().nullsLast(),
      table.translatableElementId.asc().nullsLast(),
      table.stringId.asc().nullsLast(),
    ),
    // Index for faster translation lookup by element
    index().using("btree", table.translatableElementId.asc().nullsLast()),
  ],
);

export const translationSnapshot = snakeCase.table("TranslationSnapshot", {
  id: serial().primaryKey(),
  projectId: uuid()
    .notNull()
    .references(() => project.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  creatorId: uuid().references(() => user.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  ...timestamps,
});

export const translationSnapshotItem = snakeCase.table(
  "TranslationSnapshotItem",
  {
    id: serial().primaryKey(),
    snapshotId: integer()
      .notNull()
      .references(() => translationSnapshot.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    translationId: integer()
      .notNull()
      .references(() => translation.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    ...timestamps,
  },
);

export const translationVote = snakeCase.table(
  "TranslationVote",
  {
    id: serial().primaryKey(),
    value: integer().default(0).notNull(),
    voterId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
    translationId: integer()
      .notNull()
      .references(() => translation.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    ...timestamps,
  },
  (table) => [
    index().using("btree", table.translationId.asc().nullsLast()),
    index().using("btree", table.voterId.asc().nullsLast()),
    uniqueIndex().using(
      "btree",
      table.voterId.asc().nullsLast(),
      table.translationId.asc().nullsLast(),
    ),
  ],
);

export const qaResult = snakeCase.table("QaResult", {
  id: serial().primaryKey(),
  translationId: integer()
    .notNull()
    .references(() => translation.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  ...timestamps,
});

export const qaResultItem = snakeCase.table("QaResultItem", {
  id: serial().primaryKey(),
  meta: jsonb().$type<NonNullJSONType>(),
  isPassed: boolean().notNull(),
  resultId: integer()
    .notNull()
    .references(() => qaResult.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  checkerId: integer()
    .notNull()
    .references(() => pluginService.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  ...timestamps,
});

export const user = snakeCase.table(
  "User",
  {
    id: uuid().defaultRandom().primaryKey(),
    name: text().notNull(),
    email: text().notNull(),
    emailVerified: boolean().default(false).notNull(),
    avatarFileId: integer().references(() => file.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    ...timestamps,
  },
  (table) => [unique().on(table.email, table.name)],
);

// ─── Agent System ───

export const agentDefinitionType = pgEnum(
  "AgentDefinitionType",
  AgentDefinitionTypeValues,
);

export const agentSessionStatus = pgEnum(
  "AgentSessionStatus",
  AgentSessionStatusValues,
);

export const agentToolTarget = pgEnum("AgentToolTarget", AgentToolTargetValues);

export const agentToolConfirmationStatus = pgEnum(
  "AgentToolConfirmationStatus",
  AgentToolConfirmationStatusValues,
);

export const agentSessionTrustPolicy = pgEnum(
  "AgentSessionTrustPolicy",
  AgentSessionTrustPolicyValues,
);

export const agentDefinition = snakeCase.table("AgentDefinition", {
  id: serial().primaryKey(),
  externalId: uuid().defaultRandom().notNull().unique(),
  scopeType: scopeType().notNull().default("GLOBAL"),
  /** Empty string for GLOBAL scope; project externalId for PROJECT scope */
  scopeId: text().notNull().default(""),
  name: text().notNull(),
  description: text().notNull().default(""),
  /** Agent usage type/category */
  type: agentDefinitionType().notNull().default("GENERAL"),

  // ── r2: 元数据列 (replaces single `definition` JSONB column) ──
  /**
   * Human-readable slug ID from frontmatter (e.g. "translator-zh-en").
   * Distinct from `id` (serial PK) and `externalId` (UUID for API exposure).
   */
  definitionId: text().notNull().default(""),
  version: text().notNull().default("1.0.0"),
  icon: text(),
  /** LLM configuration (providerId, temperature, maxTokens) */
  llmConfig: jsonb().$type<AgentLLMConfig | null>(),
  /** List of allowed tool names */
  tools: jsonb().$type<string[]>().notNull().default([]),
  /** Prompt auto-injection configuration */
  promptConfig: jsonb().$type<AgentPromptConfig | null>(),
  /** Runtime constraints */
  constraints: jsonb().$type<AgentConstraints | null>(),
  /** Security policy */
  securityPolicy: jsonb().$type<AgentSecurityPolicy | null>(),
  /** Multi-agent orchestration config */
  orchestration: jsonb().$type<Orchestration | null>(),
  /** MD body / system prompt content (supports {{variable}} interpolation) */
  content: text().notNull().default(""),

  isBuiltin: boolean().notNull().default(false),
  ...timestamps,
});

export const agentSession = snakeCase.table(
  "AgentSession",
  {
    id: serial().primaryKey(),
    externalId: uuid().defaultRandom().notNull().unique(),
    agentDefinitionId: integer()
      .notNull()
      .references(() => agentDefinition.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    userId: uuid().references(() => user.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    /** Optional project association for workflow runs */
    projectId: uuid().references(() => project.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    status: agentSessionStatus().notNull().default("ACTIVE"),
    /** Current active run (Graph runtime) */
    currentRunId: integer(),
    /** Optional Issue associated with this session */
    issueId: integer().references(() => issue.id, { onDelete: "set null" }),
    /** Optional Pull Request associated with this session (Isolation mode) */
    pullRequestId: integer().references(() => pullRequest.id, {
      onDelete: "set null",
    }),
    /** Maximum number of DAG turns for this session (snapshot of agentDefinition.constraints.maxSteps at creation) */
    maxTurns: integer().default(50).notNull(),
    /** Current DAG loop turn count (incremented by DecisionNode each cycle) */
    currentTurn: integer().default(0).notNull(),
    /** Session-level trust policy for tool confirmation */
    trustPolicy: agentSessionTrustPolicy().notNull().default("CONFIRM_ALL"),
    /** Business context metadata (e.g. projectId, documentId) */
    metadata: jsonb().$type<JSONType>().notNull().default({}),
    ...timestamps,
  },
  (table) => [
    index().on(table.agentDefinitionId),
    index().on(table.userId),
    index().on(table.projectId),
  ],
);

export const agentRun = snakeCase.table(
  "AgentRun",
  {
    id: serial().primaryKey(),
    externalId: uuid().defaultRandom().notNull().unique(),
    sessionId: integer()
      .notNull()
      .references(() => agentSession.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /** running | paused | completed | failed | cancelled */
    status: text().notNull().default("running"),
    graphDefinition: jsonb().$type<NonNullJSONType>().notNull(),
    blackboardSnapshot: jsonb().$type<JSONType>(),
    currentNodeId: text(),
    deduplicationKey: text(),
    startedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp({ withTimezone: true }),
    metadata: jsonb().$type<JSONType>(),
  },
  (table) => [
    index().on(table.sessionId),
    index().on(table.status),
    index().on(table.deduplicationKey),
  ],
);

export const agentEvent = snakeCase.table(
  "AgentEvent",
  {
    id: serial().primaryKey(),
    runId: integer()
      .notNull()
      .references(() => agentRun.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    eventId: uuid().defaultRandom().notNull(),
    parentEventId: uuid(),
    nodeId: text(),
    type: text().notNull(),
    payload: jsonb().$type<NonNullJSONType>().notNull(),
    timestamp: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index().on(table.runId),
    index().on(table.type),
    unique().on(table.runId, table.eventId),
  ],
);

export const agentExternalOutput = snakeCase.table(
  "AgentExternalOutput",
  {
    id: serial().primaryKey(),
    runId: integer()
      .notNull()
      .references(() => agentRun.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    nodeId: text().notNull(),
    /** llm_response | tool_result */
    outputType: text().notNull(),
    outputKey: text().notNull(),
    payload: jsonb().$type<NonNullJSONType>().notNull(),
    idempotencyKey: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index().on(table.runId),
    index().on(table.nodeId),
    unique().on(table.runId, table.outputKey, table.idempotencyKey),
  ],
);

// ─── ChangeSet / EntityVCS Tables ───────────────────────────

export const entityBranch = snakeCase.table(
  "EntityBranch",
  {
    id: serial().primaryKey(),
    externalId: uuid().defaultRandom().notNull().unique(),
    projectId: uuid()
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    name: text().notNull(),
    status: entityBranchStatus().notNull().default("ACTIVE"),
    hasConflicts: boolean().notNull().default(false),
    baseChangesetId: integer(),
    createdBy: uuid().references(() => user.id, { onDelete: "set null" }),
    createdByAgentId: integer().references(() => agentDefinition.id, {
      onDelete: "set null",
    }),
    mergedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index().on(table.projectId),
    uniqueIndex().on(table.projectId, table.name),
    index().on(table.status),
  ],
);

export const changeset = snakeCase.table("Changeset", {
  id: serial().primaryKey(),
  externalId: uuid().notNull().unique().defaultRandom(),
  projectId: uuid()
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  agentRunId: integer().references(() => agentRun.id, {
    onDelete: "set null",
  }),
  pullRequestId: integer().references(() => pullRequest.id, {
    onDelete: "set null",
  }),
  branchId: integer().references(() => entityBranch.id, {
    onDelete: "set null",
  }),
  status: changesetStatus().notNull().default("PENDING"),
  createdBy: uuid().references(() => user.id, { onDelete: "set null" }),
  reviewedBy: uuid().references(() => user.id, { onDelete: "set null" }),
  summary: text(),
  asyncStatus: changesetEntryAsyncStatus(),
  reviewedAt: timestamp({ withTimezone: true }),
  appliedAt: timestamp({ withTimezone: true }),
  ...timestamps,
});

export const changesetEntry = snakeCase.table(
  "ChangesetEntry",
  {
    id: serial().primaryKey(),
    changesetId: integer()
      .notNull()
      .references(() => changeset.id, { onDelete: "cascade" }),
    entityType: entityType().notNull(),
    entityId: text().notNull(),
    action: changeAction().notNull(),
    before: jsonb().$type<JSONType>(),
    after: jsonb().$type<JSONType>(),
    fieldPath: text(),
    riskLevel: riskLevel().notNull().default("LOW"),
    reviewStatus: reviewStatus().notNull().default("PENDING"),
    asyncStatus: asyncStatus(),
    asyncTaskIds: jsonb().$type<string[]>(),
    ...timestamps,
  },
  (table) => [
    index().using("btree", table.changesetId),
    index().using("btree", table.entityType, table.entityId),
  ],
);

export const semanticDiffEntry = snakeCase.table(
  "SemanticDiffEntry",
  {
    id: serial().primaryKey(),
    projectId: uuid()
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    changesetId: integer().references(() => changeset.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    diffKind: semanticDiffKind().notNull(),
    elementId: integer().references(() => translatableElement.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    contentNodeId: uuid().references(() => contentNode.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    contentRelationId: uuid().references(() => contentRelation.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    vectorInvalidationReason: vectorInvalidationReason().notNull(),
    payload: jsonb().$type<SemanticDiffEntryPayload>().notNull(),
    ...timestamps,
  },
  (table) => [
    index().on(table.projectId, table.diffKind),
    index().on(table.changesetId),
    index().on(table.elementId),
  ],
);

export const entitySnapshot = snakeCase.table("EntitySnapshot", {
  id: serial().primaryKey(),
  externalId: uuid().notNull().unique().defaultRandom(),
  projectId: uuid()
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  name: text().notNull(),
  description: text(),
  /** PROJECT | DOCUMENT | ELEMENT */
  level: text().notNull().default("PROJECT"),
  scopeFilter: jsonb().$type<JSONType>(),
  createdBy: uuid().references(() => user.id, { onDelete: "set null" }),
  ...timestamps,
});

export const toolCallLog = snakeCase.table(
  "ToolCallLog",
  {
    id: serial().primaryKey(),
    sessionId: integer()
      .notNull()
      .references(() => agentSession.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    runId: integer()
      .notNull()
      .references(() => agentRun.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    nodeId: text(),
    toolName: text().notNull(),
    /** Tool call arguments as JSON */
    arguments: jsonb().$type<NonNullJSONType>().notNull().default({}),
    /** Tool call result as JSON */
    result: jsonb().$type<JSONType>(),
    /** Error message if the call failed */
    error: text(),
    /** Duration in milliseconds */
    durationMs: integer(),
    sideEffectType: text().notNull().default("none"),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index().on(table.sessionId), index().on(table.runId)],
);

// ============ Permission System Tables ============

export const role = snakeCase.table("Role", {
  id: serial().primaryKey(),
  name: text().notNull().unique(),
  description: text(),
  isSystem: boolean().default(false).notNull(),
  ...timestamps,
});

export const userRole = snakeCase.table(
  "UserRole",
  {
    id: serial().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    roleId: integer()
      .notNull()
      .references(() => role.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [unique().on(table.userId, table.roleId)],
);

export const permissionTuple = snakeCase.table(
  "PermissionTuple",
  {
    id: serial().primaryKey(),
    subjectType: subjectType().notNull(),
    subjectId: text().notNull(),
    relation: relation().notNull(),
    objectType: objectType().notNull(),
    /** Resource ID; use "*" for system-level objects */
    objectId: text().notNull(),
    ...timestamps,
  },
  (table) => [
    unique().on(
      table.subjectType,
      table.subjectId,
      table.relation,
      table.objectType,
      table.objectId,
    ),
    index().on(table.subjectType, table.subjectId),
    index().on(table.objectType, table.objectId),
  ],
);

export const authAuditLog = snakeCase.table("AuthAuditLog", {
  id: serial().primaryKey(),
  timestamp: timestamp({ withTimezone: true }).defaultNow().notNull(),
  subjectType: subjectType().notNull(),
  subjectId: text().notNull(),
  action: permissionAction().notNull(),
  objectType: objectType().notNull(),
  objectId: text().notNull(),
  relation: relation().notNull(),
  result: boolean().notNull(),
  traceId: text(),
  ip: text(),
  userAgent: text(),
});

// ====== API Key ======
export const apiKey = snakeCase.table(
  "ApiKey",
  {
    id: serial().primaryKey(),
    name: text().notNull(),
    keyHash: text().notNull(),
    keyPrefix: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    scopes: jsonb().$type<string[]>().notNull().default([]),
    expiresAt: timestamp({ withTimezone: true }),
    lastUsedAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index().on(table.userId),
    index().on(table.keyHash),
    index().on(table.keyPrefix),
  ],
);

// ====== Persistent Session Record ======
export const sessionRecord = snakeCase.table(
  "SessionRecord",
  {
    id: text().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ip: text(),
    userAgent: text(),
    authProviderId: integer(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    revokedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (table) => [index().on(table.userId)],
);

// ====== Login Attempt (Rate Limiting & Audit) ======
export const loginAttempt = snakeCase.table(
  "LoginAttempt",
  {
    id: serial().primaryKey(),
    identifier: text().notNull(),
    ip: text(),
    userAgent: text(),
    success: boolean().notNull(),
    failReason: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index().on(table.ip),
    index().on(table.identifier),
    index().on(table.createdAt),
  ],
);

// ====== Auth Flow Audit Log ======
export const authFlowLog = snakeCase.table(
  "AuthFlowLog",
  {
    id: serial().primaryKey(),
    /** The auth flow's Redis flowId (UUID) */
    flowId: text().notNull(),
    /** Which flow definition was used, e.g. "standard-login" */
    flowDefId: text().notNull(),
    /** User ID if the flow successfully resolved identity */
    userId: uuid().references(() => user.id, { onDelete: "set null" }),
    /** Final status of the flow */
    status: text().notNull(),
    /** The terminal node reached (e.g. "finalize", "user-not-found") */
    finalNode: text(),
    /** Authenticator Assurance Level achieved */
    aal: integer(),
    ip: text(),
    userAgent: text(),
    /** Flow duration in milliseconds */
    durationMs: integer(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    index().on(table.userId),
    index().on(table.flowId),
    index().on(table.createdAt),
  ],
);

// ====== Message System ======

export const notification = snakeCase.table(
  "Notification",
  {
    id: serial().primaryKey(),
    recipientId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
    category: messageCategory().notNull(),
    title: text().notNull(),
    body: text().notNull(),
    data: jsonb().$type<JSONType>(),
    status: notificationStatus()
      .notNull()
      .$type<NotificationStatus>()
      .default("UNREAD"),
    ...timestamps,
  },
  (table) => [
    index().using("btree", table.recipientId.asc().nullsLast()),
    index().using("btree", table.status.asc().nullsLast()),
    index().on(table.recipientId, table.status),
    index().on(table.recipientId, table.createdAt),
  ],
);

export const userMessagePreference = snakeCase.table(
  "UserMessagePreference",
  {
    id: serial().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
    category: messageCategory().notNull(),
    channel: messageChannel().notNull(),
    enabled: boolean().notNull().default(true),
    ...timestamps,
  },
  (table) => [
    unique().on(table.userId, table.category, table.channel),
    index().using("btree", table.userId.asc().nullsLast()),
  ],
);

// ─── Recall Variant Enums ─────────────────────────────────────────────────

export const recallVariantType = pgEnum(
  "RecallVariantType",
  RecallVariantTypeValues,
);

export const recallQuerySide = pgEnum("RecallQuerySide", RecallQuerySideValues);

// ─── Term Recall Variant Table ────────────────────────────────────────────

export const termRecallVariant = snakeCase.table(
  "TermRecallVariant",
  {
    id: serial().primaryKey(),
    conceptId: integer()
      .notNull()
      .references(() => termConcept.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    languageId: text()
      .notNull()
      .references(() => language.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    text: text().notNull(),
    normalizedText: text().notNull(),
    variantType: recallVariantType().notNull(),
    meta: jsonb().$type<JSONType>(),
    ...timestamps,
  },
  (table) => [
    index().using("btree", table.conceptId.asc().nullsLast()),
    index().using("btree", table.languageId.asc().nullsLast()),
    index("idx_term_recall_variant_text_trgm").using(
      "gin",
      sql`${table.normalizedText} gin_trgm_ops`,
    ),
  ],
);

// ─── Memory Recall Variant Table ──────────────────────────────────────────

export const memoryRecallVariant = snakeCase.table(
  "MemoryRecallVariant",
  {
    id: serial().primaryKey(),
    memoryItemId: integer()
      .notNull()
      .references(() => memoryItem.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    memoryId: uuid()
      .notNull()
      .references(() => memory.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    languageId: text()
      .notNull()
      .references(() => language.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    querySide: recallQuerySide().notNull(),
    text: text().notNull(),
    normalizedText: text().notNull(),
    variantType: recallVariantType().notNull(),
    meta: jsonb().$type<JSONType>(),
    ...timestamps,
  },
  (table) => [
    index().using("btree", table.memoryItemId.asc().nullsLast()),
    index().using("btree", table.memoryId.asc().nullsLast()),
    index().using("btree", table.languageId.asc().nullsLast()),
    index("idx_memory_recall_variant_text_trgm").using(
      "gin",
      sql`${table.normalizedText} gin_trgm_ops`,
    ),
  ],
);
