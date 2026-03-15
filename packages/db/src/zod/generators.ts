import { createSchemaFactory } from "drizzle-orm/zod";
import * as z from "zod/v4";

import {
  account,
  agentDefinition,
  agentEvent,
  agentExternalOutput,
  agentRun,
  agentSession,
  blob,
  chunk,
  chunkSet,
  comment,
  commentReaction,
  document,
  documentClosure,
  documentToTask,
  file,
  glossary,
  glossaryToProject,
  language,
  memory,
  memoryItem,
  memoryToProject,
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
  setting,
  task,
  term,
  termConcept,
  termConceptSubject,
  termConceptToSubject,
  translatableElement,
  translatableElementContext,
  translatableString,
  translation,
  translationSnapshot,
  translationSnapshotItem,
  translationVote,
  user,
} from "../drizzle/schema/schema.ts";

const { createSelectSchema } = createSchemaFactory({ zodInstance: z });

type SelectSchemaTable =
  | typeof account
  | typeof agentDefinition
  | typeof agentEvent
  | typeof agentExternalOutput
  | typeof agentRun
  | typeof agentSession
  | typeof blob
  | typeof chunk
  | typeof chunkSet
  | typeof comment
  | typeof commentReaction
  | typeof document
  | typeof documentClosure
  | typeof documentToTask
  | typeof file
  | typeof glossary
  | typeof glossaryToProject
  | typeof language
  | typeof memory
  | typeof memoryItem
  | typeof memoryToProject
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
  | typeof setting
  | typeof task
  | typeof term
  | typeof termConcept
  | typeof termConceptSubject
  | typeof termConceptToSubject
  | typeof translatableElement
  | typeof translatableElementContext
  | typeof translatableString
  | typeof translation
  | typeof translationSnapshot
  | typeof translationSnapshotItem
  | typeof translationVote
  | typeof user;

type TableDeclaration = {
  kind: "table";
  schemaExportName: string;
  typeExportName: string;
  buildShape: () => Record<string, unknown>;
  overrides?: Record<string, string>;
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
    outputFile: "user.ts",
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
        },
      },
      {
        kind: "table",
        schemaExportName: "MFAProviderSchema",
        typeExportName: "MFAProvider",
        buildShape: buildSelectShape(mfaProvider),
        overrides: {
          payload: "nonNullSafeZDotJson",
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
    outputFile: "document.ts",
    declarations: [
      {
        kind: "table",
        schemaExportName: "DocumentSchema",
        typeExportName: "Document",
        buildShape: buildSelectShape(document),
      },
      {
        kind: "table",
        schemaExportName: "DocumentClosureSchema",
        typeExportName: "DocumentClosure",
        buildShape: buildSelectShape(documentClosure),
      },
      {
        kind: "table",
        schemaExportName: "DocumentToTaskSchema",
        typeExportName: "DocumentToTask",
        buildShape: buildSelectShape(documentToTask),
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
        schemaExportName: "TranslatableStringSchema",
        typeExportName: "TranslatableString",
        buildShape: buildSelectShape(translatableString),
      },
      {
        kind: "table",
        schemaExportName: "TranslatableElementContextSchema",
        typeExportName: "TranslatableElementContext",
        buildShape: buildSelectShape(translatableElementContext),
        overrides: {
          jsonData: "safeZDotJson.nullable()",
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
    ],
  },
  {
    outputFile: "memory.ts",
    imports: ['import { TokenTypeSchema } from "./enum.ts";'],
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
        overrides: {
          slotMapping: "z.array(SlotMappingEntrySchema).nullable()",
        },
      },
      {
        kind: "table",
        schemaExportName: "MemoryToProjectSchema",
        typeExportName: "MemoryToProject",
        buildShape: buildSelectShape(memoryToProject),
      },
    ],
  },
  {
    outputFile: "plugin.ts",
    declarations: [
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
          meta: "safeZDotJson.nullable()",
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
    ],
  },
  {
    outputFile: "agent.ts",
    imports: [
      'import { AgentDefinitionSchema as AgentDefJsonSchema } from "../agent.ts";',
    ],
    declarations: [
      {
        kind: "table",
        schemaExportName: "AgentDefinitionSchema",
        typeExportName: "AgentDefinition",
        buildShape: buildSelectShape(agentDefinition),
        overrides: {
          definition: "AgentDefJsonSchema",
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
    outputFile: "file.ts",
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
      },
    ],
  },
  {
    outputFile: "qa.ts",
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
        },
      },
    ],
  },
  {
    outputFile: "vector.ts",
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
        },
      },
      manualDeclaration(
        `export const VectorSchema = z.object({\n  id: z.int(),\n  vector: z.array(z.number()),\n  chunkId: z.int(),\n});\n\nexport type Vector = z.infer<typeof VectorSchema>;`,
      ),
    ],
  },
];
