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
    get: (input) => executeQuery(execCtx, getProject, input),
    listByCreator: (input) =>
      executeQuery(execCtx, listProjectsByCreator, input),
    listOwned: (input) => executeQuery(execCtx, listOwnedProjects, input),
    getTargetLanguages: (input) =>
      executeQuery(execCtx, getProjectTargetLanguages, input),
    listDocuments: (input) =>
      executeQuery(execCtx, listProjectDocuments, input),
    countElements: (input) =>
      executeQuery(execCtx, countProjectElements, input),
    create: (input) => executeCommand(execCtx, createProject, input),
    update: (input) => executeCommand(execCtx, updateProject, input),
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
    get: (input) => executeQuery(execCtx, getDocument, input),
    getElements: (input) => executeQuery(execCtx, getDocumentElements, input),
    getFirstElement: (input) =>
      executeQuery(execCtx, getDocumentFirstElement, input),
    getElementTranslationStatus: (input) =>
      executeQuery(execCtx, getDocumentElementTranslationStatus, input),
    getElementPageIndex: (input) =>
      executeQuery(execCtx, getDocumentElementPageIndex, input),
    countElements: (input) =>
      executeQuery(execCtx, countDocumentElements, input),
    countTranslations: (input) =>
      executeQuery(execCtx, countDocumentTranslations, input),
    createRoot: (input) => executeCommand(execCtx, createRootDocument, input),
    delete: async (input) => {
      await executeCommand(execCtx, deleteDocument, input);
    },
  },
  translation: {
    listByElement: (input) =>
      executeQuery(execCtx, listTranslationsByElement, input),
    createMany: (input) => executeCommand(execCtx, createTranslations, input),
    upsertVote: (input) =>
      executeCommand(execCtx, upsertTranslationVote, input),
    getVoteTotal: (input) =>
      executeQuery(execCtx, getTranslationVoteTotal, input),
    getSelfVote: (input) =>
      executeQuery(execCtx, getSelfTranslationVote, input),
    autoApproveDocument: (input) =>
      executeCommand(execCtx, autoApproveDocumentTranslations, input),
    delete: async (input) => {
      await executeCommand(execCtx, deleteTranslation, input);
    },
    approve: (input) => executeCommand(execCtx, approveTranslation, input),
    unapprove: (input) => executeCommand(execCtx, unapproveTranslation, input),
  },
  setting: {
    get: (input) => executeQuery(execCtx, getSettingQuery, input),
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
    getAccountMetaByIdentity: ({ userId, providedAccountId, providerIssuer }) =>
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
    getChunkVectors: (chunkIds) =>
      executeQuery(execCtx, getChunkVectors, { chunkIds }),
    searchChunkCosineSimilarity: ({
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
    get: (input) => executeQuery(execCtx, getLanguage, input),
    list: (input) => executeQuery(execCtx, listLanguages, input),
  },
  user: {
    get: (input) => executeQuery(execCtx, getUser, input),
    getAvatarFile: (input) => executeQuery(execCtx, getUserAvatarFile, input),
    update: (input) => executeCommand(execCtx, updateUser, input),
    updateAvatar: async (input) => {
      await executeCommand(execCtx, updateUserAvatar, input);
    },
  },
  comment: {
    listRoot: (input) => executeQuery(execCtx, listRootComments, input),
    listChildren: (input) => executeQuery(execCtx, listChildComments, input),
    listReactions: (input) =>
      executeQuery(execCtx, listCommentReactions, input),
    create: (input) => executeCommand(execCtx, createComment, input),
    react: (input) => executeCommand(execCtx, upsertCommentReaction, input),
    unreact: async (input) => {
      await executeCommand(execCtx, deleteCommentReaction, input);
    },
    delete: async (input) => {
      await executeCommand(execCtx, deleteComment, input);
    },
  },
  agent: {
    list: (input) => executeQuery(execCtx, listAgentDefinitions, input),
    get: (input) => executeQuery(execCtx, getAgentDefinition, input),
    listSessions: (input) => executeQuery(execCtx, listAgentSessions, input),
    create: (input) => executeCommand(execCtx, createAgentDefinition, input),
    update: (input) => executeCommand(execCtx, updateAgentDefinition, input),
    delete: (input) => executeCommand(execCtx, deleteAgentDefinition, input),
    createSession: (input) =>
      executeCommand(execCtx, createAgentSession, input),
  },
  element: {
    getContexts: (input) => executeQuery(execCtx, getElementContexts, input),
    getSourceLocation: (input) =>
      executeQuery(execCtx, getElementSourceLocation, input),
  },
  qa: {
    listDocumentGlossaryIds: (input) =>
      executeQuery(execCtx, listDocumentGlossaryIds, input),
  },
  glossary: {
    get: (input) => executeQuery(execCtx, getGlossary, input),
    listConcepts: (input) => executeQuery(execCtx, listGlossaryConcepts, input),
    listTermPairs: (input) =>
      executeQuery(execCtx, listGlossaryTermPairs, input),
    listByCreator: (input) =>
      executeQuery(execCtx, listGlossariesByCreator, input),
    listOwned: (input) => executeQuery(execCtx, listOwnedGlossaries, input),
    listProjectOwned: (input) =>
      executeQuery(execCtx, listProjectGlossaries, input),
    countConcepts: (input) =>
      executeQuery(execCtx, countGlossaryConcepts, input),
    listConceptSubjects: (input) =>
      executeQuery(execCtx, listGlossaryConceptSubjects, input),
    create: (input) => executeCommand(execCtx, createGlossary, input),
    createConcept: (input) =>
      executeCommand(execCtx, createGlossaryConcept, input),
    createConceptSubject: (input) =>
      executeCommand(execCtx, createGlossaryConceptSubject, input),
    updateConcept: (input) =>
      executeCommand(execCtx, updateGlossaryConcept, input),
    addTermToConcept: (input) =>
      executeCommand(execCtx, addGlossaryTermToConcept, input),
    deleteTerm: (input) => executeCommand(execCtx, deleteGlossaryTerm, input),
  },
  memory: {
    get: (input) => executeQuery(execCtx, getMemory, input),
    listByCreator: (input) =>
      executeQuery(execCtx, listMemoriesByCreator, input),
    listOwned: (input) => executeQuery(execCtx, listOwnedMemories, input),
    listProjectOwned: (input) =>
      executeQuery(execCtx, listProjectMemories, input),
    countItems: (input) => executeQuery(execCtx, countMemoryItems, input),
    create: (input) => executeCommand(execCtx, createMemory, input),
  },
});
