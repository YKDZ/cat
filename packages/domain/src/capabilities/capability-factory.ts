import type { PluginCapabilities } from "@/capabilities/types";

import {
  createAgentDefinition,
  createAgentSession,
  addGlossaryTermToConcept,
  createComment,
  createGlossaryConcept,
  createGlossaryConceptSubject,
  createGlossary,
  createMemory,
  addProjectTargetLanguages,
  approveTranslation,
  autoApproveDocumentTranslations,
  countDocumentElements,
  countDocumentTranslations,
  countGlossaryConcepts,
  countMemoryItems,
  countProjectElements,
  createProject,
  createRootDocument,
  createTranslations,
  deleteAgentDefinition,
  deleteGlossaryTerm,
  deleteComment,
  deleteCommentReaction,
  deleteDocument,
  deleteProject,
  deleteTranslation,
  executeCommand,
  executeQuery,
  getAgentDefinition,
  getGlossary,
  getLanguage,
  getMemory,
  getSetting as getSettingQuery,
  getUser,
  getUserAvatarFile,
  getDocument,
  getDocumentElementPageIndex,
  getDocumentElementTranslationStatus,
  getDocumentElements,
  getDocumentFirstElement,
  getProject,
  getProjectTargetLanguages,
  getElementContexts,
  getElementSourceLocation,
  getSelfTranslationVote,
  getTranslationVoteTotal,
  linkProjectGlossaries,
  linkProjectMemories,
  listAgentDefinitions,
  listAgentSessions,
  listDocumentGlossaryIds,
  listGlossaryConcepts,
  listGlossariesByCreator,
  listGlossaryConceptSubjects,
  listGlossaryTermPairs,
  listChildComments,
  listCommentReactions,
  listLanguages,
  listMemoriesByCreator,
  listOwnedGlossaries,
  listOwnedMemories,
  listProjectDocuments,
  listProjectGlossaries,
  listProjectMemories,
  listRootComments,
  listOwnedProjects,
  listProjectsByCreator,
  listTranslationsByElement,
  setSetting,
  updateAgentDefinition,
  updateUser,
  updateUserAvatar,
  upsertCommentReaction,
  upsertTranslationVote,
  unapproveTranslation,
  unlinkProjectGlossaries,
  unlinkProjectMemories,
  updateGlossaryConcept,
  updateProject,
  updateVectorDimension,
  type ExecutorContext,
  upsertChunkVectors,
  getChunkVectors,
  searchChunkCosineSimilarity,
  ensureVectorStorageSchema,
} from "@/index";
import { getAccountMetaByIdentity } from "@/queries/auth/get-account-meta-by-identity.query";

export const createPluginCapabilities = (
  execCtx: ExecutorContext,
): PluginCapabilities => ({
  project: {
    get: async (input) => executeQuery(execCtx, getProject, input),
    listByCreator: async (input) =>
      executeQuery(execCtx, listProjectsByCreator, input),
    listOwned: async (input) => executeQuery(execCtx, listOwnedProjects, input),
    getTargetLanguages: async (input) =>
      executeQuery(execCtx, getProjectTargetLanguages, input),
    listDocuments: async (input) =>
      executeQuery(execCtx, listProjectDocuments, input),
    countElements: async (input) =>
      executeQuery(execCtx, countProjectElements, input),
    create: async (input) => executeCommand(execCtx, createProject, input),
    update: async (input) => executeCommand(execCtx, updateProject, input),
    delete: async (input) => {
      await executeCommand(execCtx, deleteProject, input);
    },
    linkGlossaries: async (input) => {
      await executeCommand(execCtx, linkProjectGlossaries, input);
    },
    unlinkGlossaries: async (input) => {
      await executeCommand(execCtx, unlinkProjectGlossaries, input);
    },
    linkMemories: async (input) => {
      await executeCommand(execCtx, linkProjectMemories, input);
    },
    unlinkMemories: async (input) => {
      await executeCommand(execCtx, unlinkProjectMemories, input);
    },
    addTargetLanguages: async (input) => {
      await executeCommand(execCtx, addProjectTargetLanguages, input);
    },
  },
  document: {
    get: async (input) => executeQuery(execCtx, getDocument, input),
    getElements: async (input) =>
      executeQuery(execCtx, getDocumentElements, input),
    getFirstElement: async (input) =>
      executeQuery(execCtx, getDocumentFirstElement, input),
    getElementTranslationStatus: async (input) =>
      executeQuery(execCtx, getDocumentElementTranslationStatus, input),
    getElementPageIndex: async (input) =>
      executeQuery(execCtx, getDocumentElementPageIndex, input),
    countElements: async (input) =>
      executeQuery(execCtx, countDocumentElements, input),
    countTranslations: async (input) =>
      executeQuery(execCtx, countDocumentTranslations, input),
    createRoot: async (input) =>
      executeCommand(execCtx, createRootDocument, input),
    delete: async (input) => {
      await executeCommand(execCtx, deleteDocument, input);
    },
  },
  translation: {
    listByElement: async (input) =>
      executeQuery(execCtx, listTranslationsByElement, input),
    createMany: async (input) =>
      executeCommand(execCtx, createTranslations, input),
    upsertVote: async (input) =>
      executeCommand(execCtx, upsertTranslationVote, input),
    getVoteTotal: async (input) =>
      executeQuery(execCtx, getTranslationVoteTotal, input),
    getSelfVote: async (input) =>
      executeQuery(execCtx, getSelfTranslationVote, input),
    autoApproveDocument: async (input) =>
      executeCommand(execCtx, autoApproveDocumentTranslations, input),
    delete: async (input) => {
      await executeCommand(execCtx, deleteTranslation, input);
    },
    approve: async (input) =>
      executeCommand(execCtx, approveTranslation, input),
    unapprove: async (input) =>
      executeCommand(execCtx, unapproveTranslation, input),
  },
  setting: {
    get: async (input) => executeQuery(execCtx, getSettingQuery, input),
    set: async (input) => {
      await executeCommand(execCtx, setSetting, input);
    },
    getServerUrl: async () => {
      const value = await executeQuery(execCtx, getSettingQuery, {
        key: "server.url",
      });
      return typeof value === "string" ? value : "http://localhost:3000";
    },
  },
  auth: {
    getAccountMetaByIdentity: async ({
      userId,
      providedAccountId,
      providerIssuer,
    }) =>
      executeQuery(execCtx, getAccountMetaByIdentity, {
        userId,
        providedAccountId,
        providerIssuer,
      }),
  },
  vector: {
    upsertChunkVectors: async (chunks) => {
      await executeCommand(execCtx, upsertChunkVectors, { chunks });
    },
    getChunkVectors: async (chunkIds) =>
      executeQuery(execCtx, getChunkVectors, { chunkIds }),
    searchChunkCosineSimilarity: async ({
      vectors,
      chunkIdRange,
      minSimilarity,
      maxAmount,
    }) =>
      executeQuery(execCtx, searchChunkCosineSimilarity, {
        vectors,
        chunkIdRange,
        minSimilarity,
        maxAmount,
      }),
    updateDimension: async (dimension) => {
      await executeCommand(execCtx, updateVectorDimension, { dimension });
    },
    ensureSchema: async (dimension) => {
      await executeCommand(execCtx, ensureVectorStorageSchema, { dimension });
    },
  },
  language: {
    get: async (input) => executeQuery(execCtx, getLanguage, input),
    list: async (input) => executeQuery(execCtx, listLanguages, input),
  },
  user: {
    get: async (input) => executeQuery(execCtx, getUser, input),
    getAvatarFile: async (input) =>
      executeQuery(execCtx, getUserAvatarFile, input),
    update: async (input) => executeCommand(execCtx, updateUser, input),
    updateAvatar: async (input) => {
      await executeCommand(execCtx, updateUserAvatar, input);
    },
  },
  comment: {
    listRoot: async (input) => executeQuery(execCtx, listRootComments, input),
    listChildren: async (input) =>
      executeQuery(execCtx, listChildComments, input),
    listReactions: async (input) =>
      executeQuery(execCtx, listCommentReactions, input),
    create: async (input) => executeCommand(execCtx, createComment, input),
    react: async (input) =>
      executeCommand(execCtx, upsertCommentReaction, input),
    unreact: async (input) => {
      await executeCommand(execCtx, deleteCommentReaction, input);
    },
    delete: async (input) => {
      await executeCommand(execCtx, deleteComment, input);
    },
  },
  agent: {
    list: async (input) => executeQuery(execCtx, listAgentDefinitions, input),
    get: async (input) => executeQuery(execCtx, getAgentDefinition, input),
    listSessions: async (input) =>
      executeQuery(execCtx, listAgentSessions, input),
    create: async (input) =>
      executeCommand(execCtx, createAgentDefinition, input),
    update: async (input) =>
      executeCommand(execCtx, updateAgentDefinition, input),
    delete: async (input) =>
      executeCommand(execCtx, deleteAgentDefinition, input),
    createSession: async (input) =>
      executeCommand(execCtx, createAgentSession, input),
  },
  element: {
    getContexts: async (input) =>
      executeQuery(execCtx, getElementContexts, input),
    getSourceLocation: async (input) =>
      executeQuery(execCtx, getElementSourceLocation, input),
  },
  qa: {
    listDocumentGlossaryIds: async (input) =>
      executeQuery(execCtx, listDocumentGlossaryIds, input),
  },
  glossary: {
    get: async (input) => executeQuery(execCtx, getGlossary, input),
    listConcepts: async (input) =>
      executeQuery(execCtx, listGlossaryConcepts, input),
    listTermPairs: async (input) =>
      executeQuery(execCtx, listGlossaryTermPairs, input),
    listByCreator: async (input) =>
      executeQuery(execCtx, listGlossariesByCreator, input),
    listOwned: async (input) =>
      executeQuery(execCtx, listOwnedGlossaries, input),
    listProjectOwned: async (input) =>
      executeQuery(execCtx, listProjectGlossaries, input),
    countConcepts: async (input) =>
      executeQuery(execCtx, countGlossaryConcepts, input),
    listConceptSubjects: async (input) =>
      executeQuery(execCtx, listGlossaryConceptSubjects, input),
    create: async (input) => executeCommand(execCtx, createGlossary, input),
    createConcept: async (input) =>
      executeCommand(execCtx, createGlossaryConcept, input),
    createConceptSubject: async (input) =>
      executeCommand(execCtx, createGlossaryConceptSubject, input),
    updateConcept: async (input) =>
      executeCommand(execCtx, updateGlossaryConcept, input),
    addTermToConcept: async (input) =>
      executeCommand(execCtx, addGlossaryTermToConcept, input),
    deleteTerm: async (input) =>
      executeCommand(execCtx, deleteGlossaryTerm, input),
  },
  memory: {
    get: async (input) => executeQuery(execCtx, getMemory, input),
    listByCreator: async (input) =>
      executeQuery(execCtx, listMemoriesByCreator, input),
    listOwned: async (input) => executeQuery(execCtx, listOwnedMemories, input),
    listProjectOwned: async (input) =>
      executeQuery(execCtx, listProjectMemories, input),
    countItems: async (input) => executeQuery(execCtx, countMemoryItems, input),
    create: async (input) => executeCommand(execCtx, createMemory, input),
  },
});
