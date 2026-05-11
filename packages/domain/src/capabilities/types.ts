import type { JSONType, NonNullJSONType } from "@cat/shared";

import type { createAgentDefinition } from "@/commands/agent/create-agent-definition.cmd";
import type { createAgentSession } from "@/commands/agent/create-agent-session.cmd";
import type { deleteAgentDefinition } from "@/commands/agent/delete-agent-definition.cmd";
import type { updateAgentDefinition } from "@/commands/agent/update-agent-definition.cmd";
import type { createComment } from "@/commands/comment/create-comment.cmd";
import type { deleteCommentReaction } from "@/commands/comment/delete-comment-reaction.cmd";
import type { deleteComment } from "@/commands/comment/delete-comment.cmd";
import type { upsertCommentReaction } from "@/commands/comment/upsert-comment-reaction.cmd";
import type { addGlossaryTermToConcept } from "@/commands/glossary/add-glossary-term-to-concept.cmd";
import type { createGlossaryConceptSubject } from "@/commands/glossary/create-glossary-concept-subject.cmd";
import type { createGlossaryConcept } from "@/commands/glossary/create-glossary-concept.cmd";
import type { createGlossary } from "@/commands/glossary/create-glossary.cmd";
import type { deleteGlossaryTerm } from "@/commands/glossary/delete-glossary-term.cmd";
import type { updateGlossaryConcept } from "@/commands/glossary/update-glossary-concept.cmd";
import type { createMemory } from "@/commands/memory/create-memory.cmd";
import type { addProjectTargetLanguages } from "@/commands/project/add-project-target-languages.cmd";
import type { createProject } from "@/commands/project/create-project.cmd";
import type { deleteProject } from "@/commands/project/delete-project.cmd";
import type { linkProjectGlossaries } from "@/commands/project/link-project-glossaries.cmd";
import type { linkProjectMemories } from "@/commands/project/link-project-memories.cmd";
import type { unlinkProjectGlossaries } from "@/commands/project/unlink-project-glossaries.cmd";
import type { unlinkProjectMemories } from "@/commands/project/unlink-project-memories.cmd";
import type { updateProject } from "@/commands/project/update-project.cmd";
import type { setSetting } from "@/commands/setting/set-setting.cmd";
import type { approveTranslation } from "@/commands/translation/approve-translation.cmd";
import type { createTranslations } from "@/commands/translation/create-translations.cmd";
import type { deleteTranslation } from "@/commands/translation/delete-translation.cmd";
import type { unapproveTranslation } from "@/commands/translation/unapprove-translation.cmd";
import type { upsertTranslationVote } from "@/commands/translation/upsert-translation-vote.cmd";
import type { updateUserAvatar } from "@/commands/user/update-user-avatar.cmd";
import type { updateUser } from "@/commands/user/update-user.cmd";
import type { getAgentDefinition } from "@/queries/agent/get-agent-definition.query";
import type { listAgentDefinitions } from "@/queries/agent/list-agent-definitions.query";
import type { listAgentSessions } from "@/queries/agent/list-agent-sessions.query";
import type { listChildComments } from "@/queries/comment/list-child-comments.query";
import type { listCommentReactions } from "@/queries/comment/list-comment-reactions.query";
import type { listRootComments } from "@/queries/comment/list-root-comments.query";
import type { countGlossaryConcepts } from "@/queries/glossary/count-glossary-concepts.query";
import type { getGlossary } from "@/queries/glossary/get-glossary.query";
import type { listGlossariesByCreator } from "@/queries/glossary/list-glossaries-by-creator.query";
import type { listGlossaryConceptSubjects } from "@/queries/glossary/list-glossary-concept-subjects.query";
import type { listGlossaryConcepts } from "@/queries/glossary/list-glossary-concepts.query";
import type { listGlossaryTermPairs } from "@/queries/glossary/list-glossary-term-pairs.query";
import type { listOwnedGlossaries } from "@/queries/glossary/list-owned-glossaries.query";
import type { listProjectGlossaries } from "@/queries/glossary/list-project-glossaries.query";
import type { getLanguage } from "@/queries/language/get-language.query";
import type { listLanguages } from "@/queries/language/list-languages.query";
import type { countMemoryItems } from "@/queries/memory/count-memory-items.query";
import type { getMemory } from "@/queries/memory/get-memory.query";
import type { listMemoriesByCreator } from "@/queries/memory/list-memories-by-creator.query";
import type { listOwnedMemories } from "@/queries/memory/list-owned-memories.query";
import type { listProjectMemories } from "@/queries/memory/list-project-memories.query";
import type { getProjectTargetLanguages } from "@/queries/project/get-project-target-languages.query";
import type { getProject } from "@/queries/project/get-project.query";
import type { listOwnedProjects } from "@/queries/project/list-owned-projects.query";
import type { listProjectsByCreator } from "@/queries/project/list-projects-by-creator.query";
import type { getSetting } from "@/queries/setting/get-setting.query";
import type { getSelfTranslationVote } from "@/queries/translation/get-self-translation-vote.query";
import type { getTranslationVoteTotal } from "@/queries/translation/get-translation-vote-total.query";
import type { listTranslationsByElement } from "@/queries/translation/list-translations-by-element.query";
import type { getUserAvatarFile } from "@/queries/user/get-user-avatar-file.query";
import type { getUser } from "@/queries/user/get-user.query";
import type { Command, Query } from "@/types";

type CapabilityInput<T> =
  T extends Command<infer TInput, infer _TOutput>
    ? TInput
    : T extends Query<infer TInput, infer _TOutput>
      ? TInput
      : never;

type CapabilityOutput<T> =
  T extends Command<infer _TInput, infer TOutput>
    ? TOutput
    : T extends Query<infer _TInput, infer TOutput>
      ? TOutput
      : never;

export type ProjectCapabilities = {
  get: (
    input: CapabilityInput<typeof getProject>,
  ) => Promise<CapabilityOutput<typeof getProject>>;
  listByCreator: (
    input: CapabilityInput<typeof listProjectsByCreator>,
  ) => Promise<CapabilityOutput<typeof listProjectsByCreator>>;
  listOwned: (
    input: CapabilityInput<typeof listOwnedProjects>,
  ) => Promise<CapabilityOutput<typeof listOwnedProjects>>;
  getTargetLanguages: (
    input: CapabilityInput<typeof getProjectTargetLanguages>,
  ) => Promise<CapabilityOutput<typeof getProjectTargetLanguages>>;
  create: (
    input: CapabilityInput<typeof createProject>,
  ) => Promise<CapabilityOutput<typeof createProject>>;
  update: (
    input: CapabilityInput<typeof updateProject>,
  ) => Promise<CapabilityOutput<typeof updateProject>>;
  delete: (input: CapabilityInput<typeof deleteProject>) => Promise<void>;
  linkGlossaries: (
    input: CapabilityInput<typeof linkProjectGlossaries>,
  ) => Promise<void>;
  unlinkGlossaries: (
    input: CapabilityInput<typeof unlinkProjectGlossaries>,
  ) => Promise<void>;
  linkMemories: (
    input: CapabilityInput<typeof linkProjectMemories>,
  ) => Promise<void>;
  unlinkMemories: (
    input: CapabilityInput<typeof unlinkProjectMemories>,
  ) => Promise<void>;
  addTargetLanguages: (
    input: CapabilityInput<typeof addProjectTargetLanguages>,
  ) => Promise<void>;
};

export type TranslationCapabilities = {
  listByElement: (
    input: CapabilityInput<typeof listTranslationsByElement>,
  ) => Promise<CapabilityOutput<typeof listTranslationsByElement>>;
  createMany: (
    input: CapabilityInput<typeof createTranslations>,
  ) => Promise<CapabilityOutput<typeof createTranslations>>;
  upsertVote: (
    input: CapabilityInput<typeof upsertTranslationVote>,
  ) => Promise<CapabilityOutput<typeof upsertTranslationVote>>;
  getVoteTotal: (
    input: CapabilityInput<typeof getTranslationVoteTotal>,
  ) => Promise<CapabilityOutput<typeof getTranslationVoteTotal>>;
  getSelfVote: (
    input: CapabilityInput<typeof getSelfTranslationVote>,
  ) => Promise<CapabilityOutput<typeof getSelfTranslationVote>>;
  delete: (input: CapabilityInput<typeof deleteTranslation>) => Promise<void>;
  approve: (
    input: CapabilityInput<typeof approveTranslation>,
  ) => Promise<CapabilityOutput<typeof approveTranslation>>;
  unapprove: (
    input: CapabilityInput<typeof unapproveTranslation>,
  ) => Promise<CapabilityOutput<typeof unapproveTranslation>>;
};

export type SettingCapabilities = {
  get: (
    input: CapabilityInput<typeof getSetting>,
  ) => Promise<CapabilityOutput<typeof getSetting>>;
  set: (input: CapabilityInput<typeof setSetting>) => Promise<void>;
  getServerUrl: () => Promise<string>;
};

export type AuthCapabilities = {
  getAccountMetaByIdentity: (input: {
    userId: string;
    providedAccountId: string;
    providerIssuer: string;
  }) => Promise<JSONType | null>;
  getAccountMetaByProviderAndIdentifier: (input: {
    providedAccountId: string;
    providerIssuer: string;
  }) => Promise<JSONType | null>;
  getMfaPayloadForUser: (input: {
    userId: string;
    factorId: string;
  }) => Promise<NonNullJSONType | null>;
};

export type VectorCapabilities = {
  upsertChunkVectors: (
    chunks: { chunkId: number; vector: number[] }[],
  ) => Promise<void>;
  getChunkVectors: (
    chunkIds: number[],
  ) => Promise<{ chunkId: number; vector: number[] }[]>;
  searchChunkCosineSimilarity: (input: {
    vectors: number[][];
    chunkIdRange: number[];
    minSimilarity: number;
    maxAmount: number;
  }) => Promise<{ chunkId: number; similarity: number }[]>;
  updateDimension: (dimension: number) => Promise<void>;
  ensureSchema: (dimension: number) => Promise<void>;
};

export type LanguageCapabilities = {
  get: (
    input: CapabilityInput<typeof getLanguage>,
  ) => Promise<CapabilityOutput<typeof getLanguage>>;
  list: (
    input: CapabilityInput<typeof listLanguages>,
  ) => Promise<CapabilityOutput<typeof listLanguages>>;
};

export type UserCapabilities = {
  get: (
    input: CapabilityInput<typeof getUser>,
  ) => Promise<CapabilityOutput<typeof getUser>>;
  getAvatarFile: (
    input: CapabilityInput<typeof getUserAvatarFile>,
  ) => Promise<CapabilityOutput<typeof getUserAvatarFile>>;
  update: (
    input: CapabilityInput<typeof updateUser>,
  ) => Promise<CapabilityOutput<typeof updateUser>>;
  updateAvatar: (
    input: CapabilityInput<typeof updateUserAvatar>,
  ) => Promise<void>;
};

export type CommentCapabilities = {
  listRoot: (
    input: CapabilityInput<typeof listRootComments>,
  ) => Promise<CapabilityOutput<typeof listRootComments>>;
  listChildren: (
    input: CapabilityInput<typeof listChildComments>,
  ) => Promise<CapabilityOutput<typeof listChildComments>>;
  listReactions: (
    input: CapabilityInput<typeof listCommentReactions>,
  ) => Promise<CapabilityOutput<typeof listCommentReactions>>;
  create: (
    input: CapabilityInput<typeof createComment>,
  ) => Promise<CapabilityOutput<typeof createComment>>;
  react: (
    input: CapabilityInput<typeof upsertCommentReaction>,
  ) => Promise<CapabilityOutput<typeof upsertCommentReaction>>;
  unreact: (
    input: CapabilityInput<typeof deleteCommentReaction>,
  ) => Promise<void>;
  delete: (input: CapabilityInput<typeof deleteComment>) => Promise<void>;
};

export type AgentCapabilities = {
  list: (
    input: CapabilityInput<typeof listAgentDefinitions>,
  ) => Promise<CapabilityOutput<typeof listAgentDefinitions>>;
  get: (
    input: CapabilityInput<typeof getAgentDefinition>,
  ) => Promise<CapabilityOutput<typeof getAgentDefinition>>;
  listSessions: (
    input: CapabilityInput<typeof listAgentSessions>,
  ) => Promise<CapabilityOutput<typeof listAgentSessions>>;
  create: (
    input: CapabilityInput<typeof createAgentDefinition>,
  ) => Promise<CapabilityOutput<typeof createAgentDefinition>>;
  update: (
    input: CapabilityInput<typeof updateAgentDefinition>,
  ) => Promise<CapabilityOutput<typeof updateAgentDefinition>>;
  delete: (
    input: CapabilityInput<typeof deleteAgentDefinition>,
  ) => Promise<CapabilityOutput<typeof deleteAgentDefinition>>;
  createSession: (
    input: CapabilityInput<typeof createAgentSession>,
  ) => Promise<CapabilityOutput<typeof createAgentSession>>;
};

export type GlossaryCapabilities = {
  get: (
    input: CapabilityInput<typeof getGlossary>,
  ) => Promise<CapabilityOutput<typeof getGlossary>>;
  listConcepts: (
    input: CapabilityInput<typeof listGlossaryConcepts>,
  ) => Promise<CapabilityOutput<typeof listGlossaryConcepts>>;
  listTermPairs: (
    input: CapabilityInput<typeof listGlossaryTermPairs>,
  ) => Promise<CapabilityOutput<typeof listGlossaryTermPairs>>;
  listByCreator: (
    input: CapabilityInput<typeof listGlossariesByCreator>,
  ) => Promise<CapabilityOutput<typeof listGlossariesByCreator>>;
  listOwned: (
    input: CapabilityInput<typeof listOwnedGlossaries>,
  ) => Promise<CapabilityOutput<typeof listOwnedGlossaries>>;
  listProjectOwned: (
    input: CapabilityInput<typeof listProjectGlossaries>,
  ) => Promise<CapabilityOutput<typeof listProjectGlossaries>>;
  countConcepts: (
    input: CapabilityInput<typeof countGlossaryConcepts>,
  ) => Promise<CapabilityOutput<typeof countGlossaryConcepts>>;
  listConceptSubjects: (
    input: CapabilityInput<typeof listGlossaryConceptSubjects>,
  ) => Promise<CapabilityOutput<typeof listGlossaryConceptSubjects>>;
  create: (
    input: CapabilityInput<typeof createGlossary>,
  ) => Promise<CapabilityOutput<typeof createGlossary>>;
  createConcept: (
    input: CapabilityInput<typeof createGlossaryConcept>,
  ) => Promise<CapabilityOutput<typeof createGlossaryConcept>>;
  createConceptSubject: (
    input: CapabilityInput<typeof createGlossaryConceptSubject>,
  ) => Promise<CapabilityOutput<typeof createGlossaryConceptSubject>>;
  updateConcept: (
    input: CapabilityInput<typeof updateGlossaryConcept>,
  ) => Promise<CapabilityOutput<typeof updateGlossaryConcept>>;
  addTermToConcept: (
    input: CapabilityInput<typeof addGlossaryTermToConcept>,
  ) => Promise<CapabilityOutput<typeof addGlossaryTermToConcept>>;
  deleteTerm: (
    input: CapabilityInput<typeof deleteGlossaryTerm>,
  ) => Promise<CapabilityOutput<typeof deleteGlossaryTerm>>;
};

export type MemoryCapabilities = {
  get: (
    input: CapabilityInput<typeof getMemory>,
  ) => Promise<CapabilityOutput<typeof getMemory>>;
  listByCreator: (
    input: CapabilityInput<typeof listMemoriesByCreator>,
  ) => Promise<CapabilityOutput<typeof listMemoriesByCreator>>;
  listOwned: (
    input: CapabilityInput<typeof listOwnedMemories>,
  ) => Promise<CapabilityOutput<typeof listOwnedMemories>>;
  listProjectOwned: (
    input: CapabilityInput<typeof listProjectMemories>,
  ) => Promise<CapabilityOutput<typeof listProjectMemories>>;
  countItems: (
    input: CapabilityInput<typeof countMemoryItems>,
  ) => Promise<CapabilityOutput<typeof countMemoryItems>>;
  create: (
    input: CapabilityInput<typeof createMemory>,
  ) => Promise<CapabilityOutput<typeof createMemory>>;
};

export type PluginCapabilities = {
  project: ProjectCapabilities;
  translation: TranslationCapabilities;
  setting: SettingCapabilities;
  auth: AuthCapabilities;
  vector: VectorCapabilities;
  language: LanguageCapabilities;
  user: UserCapabilities;
  comment: CommentCapabilities;
  agent: AgentCapabilities;
  glossary: GlossaryCapabilities;
  memory: MemoryCapabilities;
};
