import { createSchemaFactory } from "drizzle-orm/zod";
import * as z from "zod";

import {
  account,
  apiKey,
  agentDefinition,
  agentEvent,
  agentExternalOutput,
  agentRun,
  agentSession,
  blob,
  bootstrapReceipt,
  chunk,
  chunkSet,
  comment,
  commentReaction,
  contentNode,
  contentNodeToTask,
  contentRelation,
  contentRelationType,
  contextEvidence,
  contextProfile,
  file,
  glossary,
  glossaryToProject,
  language,
  languageAnalysisObservation,
  languageAnalysisSelection,
  memory,
  memoryItemDeletion,
  memoryItem,
  memoryPromotionRecord,
  memoryRecallVariant,
  memoryToProject,
  operationFailure,
  personalMemoryBinding,
  mfaProvider,
  plugin,
  pluginComponent,
  pluginConfig,
  pluginConfigInstance,
  pluginInstallation,
  pluginService,
  project,
  projectTargetLanguage,
  qaResult,
  qaResultItem,
  qaReviewAnnotation,
  qaReviewDecision,
  qaReviewFinding,
  qaReviewProfile,
  qaReviewQueueItem,
  qaReviewRun,
  qaReviewSuggestion,
  recallDerivationState,
  recallDerivationTaskDemand,
  runtimeCacheEntry,
  runtimeQueueTask,
  runtimeSessionEntry,
  scopeBinding,
  semanticDiffEntry,
  sessionRecord,
  setting,
  task,
  workflowTaskDispatch,
  term,
  termConcept,
  termConceptSubject,
  termConceptToSubject,
  termRecallVariant,
  translatableElement,
  vectorizedString,
  translation,
  translationSnapshot,
  translationSnapshotItem,
  translationVote,
  user,
  changeset,
  changesetEntry,
  entitySnapshot,
  toolCallLog,
  issue,
  issueLabel,
  pullRequest,
  entityBranch,
  issueCommentThread,
  issueComment,
  crossReference,
  projectSequence,
} from "../drizzle/schema/schema.ts";

const { createSelectSchema } = createSchemaFactory({ zodInstance: z });

type SelectSchemaTable =
  | typeof account
  | typeof apiKey
  | typeof agentDefinition
  | typeof agentEvent
  | typeof agentExternalOutput
  | typeof agentRun
  | typeof agentSession
  | typeof blob
  | typeof bootstrapReceipt
  | typeof chunk
  | typeof chunkSet
  | typeof comment
  | typeof commentReaction
  | typeof contentNode
  | typeof contentNodeToTask
  | typeof contentRelation
  | typeof contentRelationType
  | typeof contextEvidence
  | typeof contextProfile
  | typeof file
  | typeof glossary
  | typeof glossaryToProject
  | typeof language
  | typeof languageAnalysisObservation
  | typeof languageAnalysisSelection
  | typeof memory
  | typeof memoryItemDeletion
  | typeof memoryItem
  | typeof memoryPromotionRecord
  | typeof memoryRecallVariant
  | typeof memoryToProject
  | typeof operationFailure
  | typeof personalMemoryBinding
  | typeof mfaProvider
  | typeof plugin
  | typeof pluginComponent
  | typeof pluginConfig
  | typeof pluginConfigInstance
  | typeof pluginInstallation
  | typeof pluginService
  | typeof project
  | typeof projectTargetLanguage
  | typeof qaResult
  | typeof qaResultItem
  | typeof qaReviewAnnotation
  | typeof qaReviewDecision
  | typeof qaReviewFinding
  | typeof qaReviewProfile
  | typeof qaReviewQueueItem
  | typeof qaReviewRun
  | typeof qaReviewSuggestion
  | typeof recallDerivationState
  | typeof recallDerivationTaskDemand
  | typeof runtimeCacheEntry
  | typeof runtimeQueueTask
  | typeof runtimeSessionEntry
  | typeof scopeBinding
  | typeof semanticDiffEntry
  | typeof sessionRecord
  | typeof setting
  | typeof task
  | typeof workflowTaskDispatch
  | typeof term
  | typeof termConcept
  | typeof termConceptSubject
  | typeof termConceptToSubject
  | typeof termRecallVariant
  | typeof translatableElement
  | typeof vectorizedString
  | typeof translation
  | typeof translationSnapshot
  | typeof translationSnapshotItem
  | typeof translationVote
  | typeof user
  | typeof changeset
  | typeof changesetEntry
  | typeof entitySnapshot
  | typeof toolCallLog
  | typeof issue
  | typeof issueLabel
  | typeof pullRequest
  | typeof entityBranch
  | typeof issueCommentThread
  | typeof issueComment
  | typeof crossReference
  | typeof projectSequence;

type TableDeclaration = {
  kind: "table";
  schemaExportName: string;
  typeExportName: string;
  buildShape: () => Record<string, unknown>;
  overrides?: Record<string, string>;
  refinement?: string;
};

type ManualDeclaration = {
  kind: "manual";
  source: string;
};

export type GeneratedDeclaration = TableDeclaration | ManualDeclaration;

export type GeneratedFileSpec = {
  outputFile: string;
  imports?: string[];
  declarations: GeneratedDeclaration[];
};

const buildSelectShape = <TTable extends SelectSchemaTable>(table: TTable) => {
  return (): Record<string, unknown> => {
    const schema = createSelectSchema(table);
    return Object.fromEntries(Object.entries(schema.shape));
  };
};

const manualDeclaration = (source: string): ManualDeclaration => ({
  kind: "manual",
  source,
});

export const generatedSharedSchemaFiles: GeneratedFileSpec[] = [
  {
    outputFile: "api-key.ts",
    imports: [
      'import { ServiceImplementationReferenceSchema } from "#/schema/service-implementation-reference.ts";',
    ],
    declarations: [
      {
        kind: "table",
        schemaExportName: "ApiKeySchema",
        typeExportName: "ApiKey",
        buildShape: buildSelectShape(apiKey),
        overrides: {
          scopes: "z.array(z.string())",
        },
      },
      {
        kind: "table",
        schemaExportName: "SessionRecordSchema",
        typeExportName: "SessionRecord",
        buildShape: buildSelectShape(sessionRecord),
        overrides: {
          authProvider: "ServiceImplementationReferenceSchema",
        },
      },
    ],
  },
  {
    outputFile: "user.ts",
    imports: [
      'import { ServiceImplementationReferenceSchema } from "#/schema/service-implementation-reference.ts";',
    ],
    declarations: [
      {
        kind: "table",
        schemaExportName: "UserSchema",
        typeExportName: "User",
        buildShape: buildSelectShape(user),
        overrides: {
          email: "z.email()",
        },
      },
      {
        kind: "table",
        schemaExportName: "AccountSchema",
        typeExportName: "Account",
        buildShape: buildSelectShape(account),
        overrides: {
          meta: "safeZDotJson.nullable()",
          authProvider: "ServiceImplementationReferenceSchema",
        },
      },
      {
        kind: "table",
        schemaExportName: "MFAProviderSchema",
        typeExportName: "MFAProvider",
        buildShape: buildSelectShape(mfaProvider),
        overrides: {
          payload: "nonNullSafeZDotJson",
          mfaService: "ServiceImplementationReferenceSchema",
        },
      },
    ],
  },
  {
    outputFile: "project.ts",
    declarations: [
      {
        kind: "table",
        schemaExportName: "ProjectSchema",
        typeExportName: "Project",
        buildShape: buildSelectShape(project),
        overrides: {
          features:
            "z.object({ issues: z.boolean(), pullRequests: z.boolean() })",
        },
      },
      {
        kind: "table",
        schemaExportName: "ProjectTargetLanguageSchema",
        typeExportName: "ProjectTargetLanguage",
        buildShape: buildSelectShape(projectTargetLanguage),
      },
    ],
  },
  {
    outputFile: "language-analysis.ts",
    imports: [
      'import { LanguageAnalysisSelectionFingerprintSchema } from "#/schema/language-analysis-requirement.ts";',
      'import { LanguageAnalysisRequirementAssessmentSchema } from "#/schema/language-analysis-requirement.ts";',
      'import { ServiceImplementationReferenceSchema } from "#/schema/service-implementation-reference.ts";',
    ],
    declarations: [
      {
        kind: "table",
        schemaExportName: "LanguageAnalysisSelectionRecordSchema",
        typeExportName: "LanguageAnalysisSelectionRecord",
        buildShape: buildSelectShape(languageAnalysisSelection),
        overrides: {
          configurationFingerprint:
            "LanguageAnalysisSelectionFingerprintSchema.nullable()",
          implementation: "ServiceImplementationReferenceSchema.nullable()",
        },
      },
      {
        kind: "table",
        schemaExportName: "LanguageAnalysisObservationRecordSchema",
        typeExportName: "LanguageAnalysisObservationRecord",
        buildShape: buildSelectShape(languageAnalysisObservation),
        overrides: {
          assessment: "LanguageAnalysisRequirementAssessmentSchema",
        },
      },
    ],
  },
  {
    outputFile: "content.ts",
    imports: [
      'import { ServiceImplementationReferenceSchema } from "#/schema/service-implementation-reference.ts";',
      'import { ContentRelationAllowedEndpointPairSchema, ContextProfilePayloadSchema, SemanticDiffEntryPayloadSchema } from "#/schema/content.ts";',
    ],
    declarations: [
      {
        kind: "table",
        schemaExportName: "ContentNodeSchema",
        typeExportName: "ContentNode",
        buildShape: buildSelectShape(contentNode),
        overrides: {
          provenance: "safeZDotJson.nullable()",
          metadata: "safeZDotJson.nullable()",
          fileHandler: "ServiceImplementationReferenceSchema.nullable()",
        },
      },
      {
        kind: "table",
        schemaExportName: "ContentRelationTypeSchema",
        typeExportName: "ContentRelationType",
        buildShape: buildSelectShape(contentRelationType),
        overrides: {
          allowedEndpointPairs:
            "z.array(ContentRelationAllowedEndpointPairSchema)",
          deprecation: "safeZDotJson.nullable()",
          migration: "safeZDotJson.nullable()",
          metadata: "safeZDotJson.nullable()",
        },
      },
      {
        kind: "table",
        schemaExportName: "ContentRelationSchema",
        typeExportName: "ContentRelation",
        buildShape: buildSelectShape(contentRelation),
        overrides: {
          weightHint: "safeZDotJson.nullable()",
          provenance: "safeZDotJson.nullable()",
          validationMetadata: "safeZDotJson.nullable()",
        },
      },
      {
        kind: "table",
        schemaExportName: "ContentNodeToTaskSchema",
        typeExportName: "ContentNodeToTask",
        buildShape: buildSelectShape(contentNodeToTask),
      },
      {
        kind: "table",
        schemaExportName: "TranslatableElementSchema",
        typeExportName: "TranslatableElement",
        buildShape: buildSelectShape(translatableElement),
        overrides: {
          meta: "safeZDotJson.nullable()",
          sourceLocationMeta: "safeZDotJson.nullable()",
        },
      },
      {
        kind: "table",
        schemaExportName: "VectorizedStringSchema",
        typeExportName: "VectorizedString",
        buildShape: buildSelectShape(vectorizedString),
      },
      {
        kind: "table",
        schemaExportName: "ContextEvidenceSchema",
        typeExportName: "ContextEvidence",
        buildShape: buildSelectShape(contextEvidence),
        overrides: {
          jsonData: "safeZDotJson.nullable()",
          provenance: "safeZDotJson.nullable()",
          graphExplanation: "safeZDotJson.nullable()",
          storageProvider: "ServiceImplementationReferenceSchema.nullable()",
        },
      },
      {
        kind: "table",
        schemaExportName: "ContextProfileSchema",
        typeExportName: "ContextProfile",
        buildShape: buildSelectShape(contextProfile),
        overrides: {
          payload: "ContextProfilePayloadSchema",
        },
      },
      {
        kind: "table",
        schemaExportName: "ScopeBindingSchema",
        typeExportName: "ScopeBinding",
        buildShape: buildSelectShape(scopeBinding),
        overrides: {
          metadata: "safeZDotJson.nullable()",
        },
      },
      {
        kind: "table",
        schemaExportName: "SemanticDiffEntrySchema",
        typeExportName: "SemanticDiffEntry",
        buildShape: buildSelectShape(semanticDiffEntry),
        overrides: {
          payload: "SemanticDiffEntryPayloadSchema",
        },
      },
    ],
  },
  {
    outputFile: "translation.ts",
    declarations: [
      {
        kind: "table",
        schemaExportName: "TranslationSchema",
        typeExportName: "Translation",
        buildShape: buildSelectShape(translation),
        overrides: {
          meta: "safeZDotJson.nullable()",
        },
      },
      {
        kind: "table",
        schemaExportName: "TranslationVoteSchema",
        typeExportName: "TranslationVote",
        buildShape: buildSelectShape(translationVote),
      },
      {
        kind: "table",
        schemaExportName: "TranslationSnapshotSchema",
        typeExportName: "TranslationSnapshot",
        buildShape: buildSelectShape(translationSnapshot),
      },
      {
        kind: "table",
        schemaExportName: "TranslationSnapshotItemSchema",
        typeExportName: "TranslationSnapshotItem",
        buildShape: buildSelectShape(translationSnapshotItem),
      },
    ],
  },
  {
    outputFile: "glossary.ts",
    imports: [
      'import { TermRecallVariantMetaSchema } from "#/schema/glossary-recall-derivation.ts";',
      'import { CanonicalInputVersionSchema, RecallDerivationVersionSchema } from "#/schema/recall-derivation.ts";',
    ],
    declarations: [
      {
        kind: "table",
        schemaExportName: "GlossarySchema",
        typeExportName: "Glossary",
        buildShape: buildSelectShape(glossary),
      },
      {
        kind: "table",
        schemaExportName: "GlossaryToProjectSchema",
        typeExportName: "GlossaryToProject",
        buildShape: buildSelectShape(glossaryToProject),
      },
      {
        kind: "table",
        schemaExportName: "TermSchema",
        typeExportName: "Term",
        buildShape: buildSelectShape(term),
      },
      {
        kind: "table",
        schemaExportName: "TermConceptSchema",
        typeExportName: "TermConcept",
        buildShape: buildSelectShape(termConcept),
      },
      {
        kind: "table",
        schemaExportName: "TermConceptToSubjectSchema",
        typeExportName: "TermConceptToSubject",
        buildShape: buildSelectShape(termConceptToSubject),
      },
      {
        kind: "table",
        schemaExportName: "TermConceptSubjectSchema",
        typeExportName: "TermConceptSubject",
        buildShape: buildSelectShape(termConceptSubject),
      },
      {
        kind: "table",
        schemaExportName: "TermRecallVariantSchema",
        typeExportName: "TermRecallVariant",
        buildShape: buildSelectShape(termRecallVariant),
        overrides: {
          meta: "TermRecallVariantMetaSchema",
          canonicalInputVersion: "CanonicalInputVersionSchema",
          recallDerivationVersion: "RecallDerivationVersionSchema",
        },
      },
    ],
  },
  {
    outputFile: "memory.ts",
    imports: [
      'import { TokenTypeSchema } from "#/schema/enum.ts";',
      'import { MemoryRecallVariantMetaSchema } from "#/schema/memory-recall-derivation.ts";',
      'import { NormalizedLanguageIdSchema } from "#/schema/language-analysis.ts";',
      'import { CanonicalInputVersionSchema, RecallDerivationBlockerSchema, RecallDerivationTargetIdSchema, RecallDerivationVersionSchema } from "#/schema/recall-derivation.ts";',
    ],
    declarations: [
      manualDeclaration(
        `export const SlotMappingEntrySchema = z.object({\n  placeholder: z.string(),\n  value: z.string(),\n  tokenType: TokenTypeSchema,\n});\n\nexport type SlotMappingEntry = z.infer<typeof SlotMappingEntrySchema>;`,
      ),
      {
        kind: "table",
        schemaExportName: "MemorySchema",
        typeExportName: "Memory",
        buildShape: buildSelectShape(memory),
      },
      {
        kind: "table",
        schemaExportName: "MemoryItemSchema",
        typeExportName: "MemoryItem",
        buildShape: buildSelectShape(memoryItem),
      },
      {
        kind: "table",
        schemaExportName: "MemoryToProjectSchema",
        typeExportName: "MemoryToProject",
        buildShape: buildSelectShape(memoryToProject),
      },
      {
        kind: "table",
        schemaExportName: "PersonalMemoryBindingSchema",
        typeExportName: "PersonalMemoryBinding",
        buildShape: buildSelectShape(personalMemoryBinding),
      },
      {
        kind: "table",
        schemaExportName: "MemoryPromotionRecordSchema",
        typeExportName: "MemoryPromotionRecord",
        buildShape: buildSelectShape(memoryPromotionRecord),
      },
      {
        kind: "table",
        schemaExportName: "MemoryItemDeletionSchema",
        typeExportName: "MemoryItemDeletion",
        buildShape: buildSelectShape(memoryItemDeletion),
      },
      {
        kind: "table",
        schemaExportName: "RecallDerivationStateSchema",
        typeExportName: "RecallDerivationState",
        buildShape: buildSelectShape(recallDerivationState),
        overrides: {
          blocker: "RecallDerivationBlockerSchema.nullable()",
          canonicalInputVersion: "CanonicalInputVersionSchema",
          currentCanonicalInputVersion:
            "CanonicalInputVersionSchema.nullable()",
          currentDerivationVersion: "RecallDerivationVersionSchema.nullable()",
          languageId: "NormalizedLanguageIdSchema",
          requiredDerivationVersion: "RecallDerivationVersionSchema.nullable()",
          targetId: "RecallDerivationTargetIdSchema",
        },
      },
      {
        kind: "table",
        schemaExportName: "RecallDerivationTaskDemandSchema",
        typeExportName: "RecallDerivationTaskDemand",
        buildShape: buildSelectShape(recallDerivationTaskDemand),
        overrides: {
          languageId: "NormalizedLanguageIdSchema",
          targetId: "RecallDerivationTargetIdSchema",
        },
      },
      {
        kind: "table",
        schemaExportName: "MemoryRecallVariantSchema",
        typeExportName: "MemoryRecallVariant",
        buildShape: buildSelectShape(memoryRecallVariant),
        overrides: {
          canonicalInputVersion: "CanonicalInputVersionSchema",
          languageId: "NormalizedLanguageIdSchema",
          meta: "MemoryRecallVariantMetaSchema.nullable()",
          recallDerivationVersion: "RecallDerivationVersionSchema",
        },
      },
    ],
  },
  {
    outputFile: "plugin.ts",
    declarations: [
      {
        kind: "table",
        schemaExportName: "BootstrapReceiptSchema",
        typeExportName: "BootstrapReceipt",
        buildShape: buildSelectShape(bootstrapReceipt),
      },
      {
        kind: "table",
        schemaExportName: "PluginSchema",
        typeExportName: "Plugin",
        buildShape: buildSelectShape(plugin),
        overrides: {
          iconUrl: "z.url().nullable()",
        },
      },
      {
        kind: "table",
        schemaExportName: "PluginInstallationSchema",
        typeExportName: "PluginInstallation",
        buildShape: buildSelectShape(pluginInstallation),
        overrides: {
          scopeMeta: "safeZDotJson.nullable()",
        },
      },
      {
        kind: "table",
        schemaExportName: "PluginConfigSchema",
        typeExportName: "PluginConfig",
        buildShape: buildSelectShape(pluginConfig),
        overrides: {
          schema: "_JSONSchemaSchema",
        },
      },
      {
        kind: "table",
        schemaExportName: "PluginConfigInstanceSchema",
        typeExportName: "PluginConfigInstance",
        buildShape: buildSelectShape(pluginConfigInstance),
        overrides: {
          value: "nonNullSafeZDotJson",
        },
      },
      {
        kind: "table",
        schemaExportName: "PluginServiceSchema",
        typeExportName: "PluginService",
        buildShape: buildSelectShape(pluginService),
      },
      {
        kind: "table",
        schemaExportName: "PluginComponentSchema",
        typeExportName: "PluginComponent",
        buildShape: buildSelectShape(pluginComponent),
      },
      manualDeclaration(
        `export const PluginPermissionSchema = z.object({\n  id: z.int(),\n  permission: z.string(),\n  description: z.string(),\n  pluginId: z.string(),\n  createdAt: DrizzleDateTimeSchema,\n  updatedAt: DrizzleDateTimeSchema,\n});\n\nexport type PluginPermission = z.infer<typeof PluginPermissionSchema>;`,
      ),
      manualDeclaration(
        `export const PluginVersionSchema = z.object({\n  id: z.int(),\n  version: z.string(),\n  pluginId: z.string(),\n});\n\nexport type PluginVersion = z.infer<typeof PluginVersionSchema>;`,
      ),
    ],
  },
  {
    outputFile: "misc.ts",
    imports: [
      'import { TaskAffectedResourceSchema, TaskKindSchema, TaskPayloadSchema, TaskRuntimeSchema } from "#/schema/localization-task.ts";',
    ],
    declarations: [
      {
        kind: "table",
        schemaExportName: "LanguageSchema",
        typeExportName: "Language",
        buildShape: buildSelectShape(language),
      },
      {
        kind: "table",
        schemaExportName: "TaskSchema",
        typeExportName: "Task",
        buildShape: buildSelectShape(task),
        overrides: {
          payload: "TaskPayloadSchema",
          resources: "z.array(TaskAffectedResourceSchema)",
          runtime: "TaskRuntimeSchema",
        },
        refinement: `(value, ctx) => {
  const parsed = TaskKindSchema.safeParse({
    kind: value.kind,
    payload: value.payload,
  });
  if (!parsed.success) {
    ctx.addIssue({ code: "custom", message: "Task kind and payload must agree." });
  }
}`,
      },
      {
        kind: "table",
        schemaExportName: "WorkflowTaskDispatchSchema",
        typeExportName: "WorkflowTaskDispatch",
        buildShape: buildSelectShape(workflowTaskDispatch),
      },
      {
        kind: "table",
        schemaExportName: "OperationFailureRecordSchema",
        typeExportName: "OperationFailureRecord",
        buildShape: buildSelectShape(operationFailure),
        overrides: {
          affectedResources: "z.array(TaskAffectedResourceSchema)",
        },
      },
      {
        kind: "table",
        schemaExportName: "SettingSchema",
        typeExportName: "Setting",
        buildShape: buildSelectShape(setting),
        overrides: {
          value: "nonNullSafeZDotJson",
        },
      },
      {
        kind: "table",
        schemaExportName: "RuntimeCacheEntrySchema",
        typeExportName: "RuntimeCacheEntry",
        buildShape: buildSelectShape(runtimeCacheEntry),
        overrides: {
          value: "safeZDotJson",
        },
      },
      {
        kind: "table",
        schemaExportName: "RuntimeSessionEntrySchema",
        typeExportName: "RuntimeSessionEntry",
        buildShape: buildSelectShape(runtimeSessionEntry),
        overrides: {
          fields: "z.record(z.string(), z.string())",
        },
      },
      {
        kind: "table",
        schemaExportName: "RuntimeQueueTaskSchema",
        typeExportName: "RuntimeQueueTask",
        buildShape: buildSelectShape(runtimeQueueTask),
        overrides: {
          payload: "nonNullSafeZDotJson",
        },
      },
    ],
  },
  {
    outputFile: "agent.ts",
    imports: [],
    declarations: [
      {
        kind: "table",
        schemaExportName: "StoredAgentDefinitionSchema",
        typeExportName: "StoredAgentDefinition",
        buildShape: buildSelectShape(agentDefinition),
        overrides: {
          llmConfig: "safeZDotJson.nullable()",
          tools: "z.array(z.string())",
          promptConfig: "safeZDotJson.nullable()",
          constraints: "safeZDotJson.nullable()",
          securityPolicy: "safeZDotJson.nullable()",
          orchestration: "safeZDotJson.nullable()",
        },
      },
      {
        kind: "table",
        schemaExportName: "AgentSessionSchema",
        typeExportName: "AgentSession",
        buildShape: buildSelectShape(agentSession),
        overrides: {
          metadata: "nonNullSafeZDotJson",
        },
      },
      {
        kind: "table",
        schemaExportName: "AgentRunSchema",
        typeExportName: "AgentRun",
        buildShape: buildSelectShape(agentRun),
        overrides: {
          graphDefinition: "nonNullSafeZDotJson",
          blackboardSnapshot: "safeZDotJson.nullable()",
          metadata: "safeZDotJson.nullable()",
        },
      },
      {
        kind: "table",
        schemaExportName: "AgentEventSchema",
        typeExportName: "AgentEvent",
        buildShape: buildSelectShape(agentEvent),
        overrides: {
          payload: "nonNullSafeZDotJson",
        },
      },
      {
        kind: "table",
        schemaExportName: "AgentExternalOutputSchema",
        typeExportName: "AgentExternalOutput",
        buildShape: buildSelectShape(agentExternalOutput),
        overrides: {
          payload: "nonNullSafeZDotJson",
        },
      },
      {
        kind: "table",
        schemaExportName: "ToolCallLogSchema",
        typeExportName: "ToolCallLog",
        buildShape: buildSelectShape(toolCallLog),
        overrides: {
          arguments: "nonNullSafeZDotJson",
          result: "safeZDotJson.nullable()",
        },
      },
    ],
  },
  {
    outputFile: "comment.ts",
    declarations: [
      {
        kind: "table",
        schemaExportName: "CommentSchema",
        typeExportName: "Comment",
        buildShape: buildSelectShape(comment),
      },
      {
        kind: "table",
        schemaExportName: "CommentReactionSchema",
        typeExportName: "CommentReaction",
        buildShape: buildSelectShape(commentReaction),
      },
    ],
  },
  {
    outputFile: "changeset.ts",
    declarations: [
      {
        kind: "table",
        schemaExportName: "ChangesetSchema",
        typeExportName: "Changeset",
        buildShape: buildSelectShape(changeset),
      },
      {
        kind: "table",
        schemaExportName: "ChangesetEntrySchema",
        typeExportName: "ChangesetEntry",
        buildShape: buildSelectShape(changesetEntry),
        overrides: {
          before: "safeZDotJson.nullable()",
          after: "safeZDotJson.nullable()",
          asyncTaskIds: "z.array(z.string()).nullable()",
        },
      },
      {
        kind: "table",
        schemaExportName: "EntitySnapshotSchema",
        typeExportName: "EntitySnapshot",
        buildShape: buildSelectShape(entitySnapshot),
        overrides: {
          scopeFilter: "safeZDotJson.nullable()",
        },
      },
    ],
  },
  {
    outputFile: "file.ts",
    imports: [
      'import { ServiceImplementationReferenceSchema } from "#/schema/service-implementation-reference.ts";',
    ],
    declarations: [
      {
        kind: "table",
        schemaExportName: "FileSchema",
        typeExportName: "File",
        buildShape: buildSelectShape(file),
      },
      {
        kind: "table",
        schemaExportName: "BlobSchema",
        typeExportName: "Blob",
        buildShape: buildSelectShape(blob),
        overrides: {
          storageProvider: "ServiceImplementationReferenceSchema",
        },
      },
    ],
  },
  {
    outputFile: "qa.ts",
    imports: [
      'import { QaReviewProfileConfigSchema, QaReviewRunMetaSchema, QaReviewSpanSchema, QaReviewTextRangeSchema } from "#/schema/qa-review.ts";',
      'import { ServiceImplementationReferenceSchema } from "#/schema/service-implementation-reference.ts";',
    ],
    declarations: [
      {
        kind: "table",
        schemaExportName: "QaResultSchema",
        typeExportName: "QaResult",
        buildShape: buildSelectShape(qaResult),
      },
      {
        kind: "table",
        schemaExportName: "QaResultItemSchema",
        typeExportName: "QaResultItem",
        buildShape: buildSelectShape(qaResultItem),
        overrides: {
          meta: "nonNullSafeZDotJson",
          checker: "ServiceImplementationReferenceSchema",
        },
      },
      {
        kind: "table",
        schemaExportName: "QaReviewProfileSchema",
        typeExportName: "QaReviewProfile",
        buildShape: buildSelectShape(qaReviewProfile),
        overrides: {
          config: "QaReviewProfileConfigSchema",
        },
      },
      {
        kind: "table",
        schemaExportName: "QaReviewRunSchema",
        typeExportName: "QaReviewRun",
        buildShape: buildSelectShape(qaReviewRun),
        overrides: {
          meta: "QaReviewRunMetaSchema.nullable()",
          checkerService: "ServiceImplementationReferenceSchema.nullable()",
          modelService: "ServiceImplementationReferenceSchema.nullable()",
        },
      },
      {
        kind: "table",
        schemaExportName: "QaReviewFindingSchema",
        typeExportName: "QaReviewFinding",
        buildShape: buildSelectShape(qaReviewFinding),
        overrides: {
          sourceSpan: "QaReviewSpanSchema.nullable()",
          targetSpan: "QaReviewSpanSchema.nullable()",
          meta: "safeZDotJson.nullable()",
          checkerService: "ServiceImplementationReferenceSchema.nullable()",
        },
      },
      {
        kind: "table",
        schemaExportName: "QaReviewQueueItemSchema",
        typeExportName: "QaReviewQueueItem",
        buildShape: buildSelectShape(qaReviewQueueItem),
      },
      {
        kind: "table",
        schemaExportName: "QaReviewAnnotationSchema",
        typeExportName: "QaReviewAnnotation",
        buildShape: buildSelectShape(qaReviewAnnotation),
        overrides: {
          targetRange: "QaReviewTextRangeSchema.nullable()",
          metadata: "safeZDotJson.nullable()",
        },
      },
      {
        kind: "table",
        schemaExportName: "QaReviewSuggestionSchema",
        typeExportName: "QaReviewSuggestion",
        buildShape: buildSelectShape(qaReviewSuggestion),
        overrides: {
          targetRange: "QaReviewTextRangeSchema.nullable()",
          metadata: "safeZDotJson.nullable()",
        },
      },
      {
        kind: "table",
        schemaExportName: "QaReviewDecisionSchema",
        typeExportName: "QaReviewDecision",
        buildShape: buildSelectShape(qaReviewDecision),
      },
    ],
  },
  {
    outputFile: "vector.ts",
    imports: [
      'import { ServiceImplementationReferenceSchema } from "#/schema/service-implementation-reference.ts";',
    ],
    declarations: [
      {
        kind: "table",
        schemaExportName: "ChunkSetSchema",
        typeExportName: "ChunkSet",
        buildShape: buildSelectShape(chunkSet),
        overrides: {
          meta: "safeZDotJson.nullable()",
        },
      },
      {
        kind: "table",
        schemaExportName: "ChunkSchema",
        typeExportName: "Chunk",
        buildShape: buildSelectShape(chunk),
        overrides: {
          meta: "safeZDotJson.nullable()",
          vectorizer: "ServiceImplementationReferenceSchema",
          vectorStorage: "ServiceImplementationReferenceSchema",
        },
      },
      manualDeclaration(
        `export const VectorSchema = z.object({\n  id: z.int(),\n  vector: z.array(z.number()),\n  chunkId: z.int(),\n});\n\nexport type Vector = z.infer<typeof VectorSchema>;`,
      ),
    ],
  },
  {
    outputFile: "issue.ts",
    declarations: [
      {
        kind: "table",
        schemaExportName: "ProjectSequenceSchema",
        typeExportName: "ProjectSequence",
        buildShape: buildSelectShape(projectSequence),
      },
      {
        kind: "table",
        schemaExportName: "IssueSchema",
        typeExportName: "Issue",
        buildShape: buildSelectShape(issue),
        overrides: {
          assignees: "nonNullSafeZDotJson",
          claimPolicy: "safeZDotJson.nullable()",
          metadata: "safeZDotJson.nullable()",
        },
      },
      {
        kind: "table",
        schemaExportName: "IssueLabelSchema",
        typeExportName: "IssueLabel",
        buildShape: buildSelectShape(issueLabel),
      },
    ],
  },
  {
    outputFile: "pull-request.ts",
    declarations: [
      {
        kind: "table",
        schemaExportName: "PullRequestSchema",
        typeExportName: "PullRequest",
        buildShape: buildSelectShape(pullRequest),
        overrides: {
          reviewers: "nonNullSafeZDotJson",
          metadata: "safeZDotJson.nullable()",
        },
      },
    ],
  },
  {
    outputFile: "entity-branch.ts",
    declarations: [
      {
        kind: "table",
        schemaExportName: "EntityBranchSchema",
        typeExportName: "EntityBranch",
        buildShape: buildSelectShape(entityBranch),
      },
    ],
  },
  {
    outputFile: "issue-comment.ts",
    declarations: [
      {
        kind: "table",
        schemaExportName: "IssueCommentThreadSchema",
        typeExportName: "IssueCommentThread",
        buildShape: buildSelectShape(issueCommentThread),
        overrides: {
          reviewContext: "safeZDotJson.nullable()",
        },
      },
      {
        kind: "table",
        schemaExportName: "IssueCommentSchema",
        typeExportName: "IssueComment",
        buildShape: buildSelectShape(issueComment),
      },
      {
        kind: "table",
        schemaExportName: "CrossReferenceSchema",
        typeExportName: "CrossReference",
        buildShape: buildSelectShape(crossReference),
      },
    ],
  },
];
