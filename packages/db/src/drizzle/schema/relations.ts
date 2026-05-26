import { defineRelations } from "drizzle-orm";

import * as schema from "./schema";

export const relations: ReturnType<typeof defineRelations<typeof schema>> =
  defineRelations(schema, (r) => ({
    account: {
      user: r.one.user({
        from: r.account.userId,
        to: r.user.id,
      }),
      authProvider: r.one.pluginService({
        from: r.account.authProviderId,
        to: r.pluginService.id,
      }),
    },
    mfaProvider: {
      user: r.one.user({
        from: r.mfaProvider.userId,
        to: r.user.id,
      }),
      mfaSerivce: r.one.pluginService({
        from: r.mfaProvider.mfaServiceId,
        to: r.pluginService.id,
      }),
    },
    user: {
      accounts: r.many.account(),
      glossaries: r.many.glossary(),
      memories: r.many.memory(),
      personalMemoryBindings: r.many.personalMemoryBinding({
        from: r.user.id,
        to: r.personalMemoryBinding.userId,
      }),
      memoryItems: r.many.memoryItem({
        from: r.user.id,
        to: r.memoryItem.creatorId,
      }),
      approvedMemoryPromotions: r.many.memoryPromotionRecord({
        from: r.user.id,
        to: r.memoryPromotionRecord.approvedById,
      }),
      memoryItemDeletions: r.many.memoryItemDeletion({
        from: r.user.id,
        to: r.memoryItemDeletion.deletedById,
      }),
      pluginConfigInstances: r.many.pluginConfigInstance(),
      projects: r.many.project(),
      terms: r.many.term(),
      translatableElements: r.many.translatableElement(),
      commentsUserId: r.many.comment({
        from: r.user.id,
        to: r.comment.userId,
      }),
      commentsViaCommentReaction: r.many.comment({
        from: r.user.id,
        to: r.comment.userId,
      }),
      translationsTranslatorId: r.many.translation({
        from: r.user.id,
        to: r.translation.translatorId,
      }),
      translationsViaTranslationVote: r.many.translation({
        from: r.user.id,
        to: r.translation.id,
      }),
      file: r.one.file({
        from: r.user.avatarFileId,
        to: r.file.id,
      }),
      mfaProvider: r.many.mfaProvider({
        from: r.user.id,
        to: r.mfaProvider.userId,
      }),
      notifications: r.many.notification(),
      messagePreferences: r.many.userMessagePreference(),
    },
    blob: {
      pluginService: r.one.pluginService({
        from: r.blob.storageProviderId,
        to: r.pluginService.id,
      }),
      files: r.many.file(),
    },
    pluginService: {
      pluginInstallation: r.one.pluginInstallation({
        from: r.pluginService.pluginInstallationId,
        to: r.pluginInstallation.id,
      }),
      blobs: r.many.blob(),
      chunkSets: r.many.chunkSet(),
      contextEvidences: r.many.contextEvidence(),
      mfaProviders: r.many.mfaProvider(),
    },
    pluginComponent: {
      pluginInstallation: r.one.pluginInstallation({
        from: r.pluginComponent.pluginInstallationId,
        to: r.pluginInstallation.id,
      }),
    },
    chunkSet: {
      pluginServices: r.many.pluginService({
        from: r.chunkSet.id.through(r.chunk.chunkSetId),
        to: r.pluginService.id.through(r.chunk.vectorizerId),
      }),
      languages: r.many.language({
        from: r.chunkSet.id.through(r.vectorizedString.chunkSetId),
        to: r.language.id.through(r.vectorizedString.languageId),
      }),
    },
    file: {
      blob: r.one.blob({
        from: r.file.blobId,
        to: r.blob.id,
      }),
      contextEvidences: r.many.contextEvidence(),
      users: r.many.user(),
    },
    project: {
      contentNodes: r.many.contentNode(),
      contentRelations: r.many.contentRelation(),
      contextProfiles: r.many.contextProfile(),
      scopeBindings: r.many.scopeBinding(),
      glossaries: r.many.glossary(),
      memories: r.many.memory(),
      personalMemoryBindings: r.many.personalMemoryBinding(),
      memoryPromotionRecords: r.many.memoryPromotionRecord(),
      user: r.one.user({
        from: r.project.creatorId,
        to: r.user.id,
      }),
      languages: r.many.language(),
      snapshots: r.many.translationSnapshot(),
      projectSequence: r.one.projectSequence({
        from: r.project.id,
        to: r.projectSequence.projectId,
      }),
      issues: r.many.issue(),
      pullRequests: r.many.pullRequest(),
      entityBranches: r.many.entityBranch(),
    },
    task: {
      contentNodes: r.many.contentNode({
        from: r.task.id.through(r.contentNodeToTask.taskId),
        to: r.contentNode.id.through(r.contentNodeToTask.contentNodeId),
      }),
    },
    glossary: {
      user: r.one.user({
        from: r.glossary.creatorId,
        to: r.user.id,
      }),
      projects: r.many.project({
        from: r.glossary.id.through(r.glossaryToProject.glossaryId),
        to: r.project.id.through(r.glossaryToProject.projectId),
      }),
      termConcepts: r.many.termConcept(),
    },
    memory: {
      user: r.one.user({
        from: r.memory.creatorId,
        to: r.user.id,
      }),
      memoryItems: r.many.memoryItem({
        from: r.memory.id,
        to: r.memoryItem.memoryId,
      }),
      projects: r.many.project({
        from: r.memory.id.through(r.memoryToProject.memoryId),
        to: r.project.id.through(r.memoryToProject.projectId),
      }),
      personalBinding: r.one.personalMemoryBinding({
        from: r.memory.id,
        to: r.personalMemoryBinding.memoryId,
      }),
      sourcePromotionRecords: r.many.memoryPromotionRecord({
        from: r.memory.id,
        to: r.memoryPromotionRecord.targetMemoryId,
      }),
      deletedItems: r.many.memoryItemDeletion({
        from: r.memory.id,
        to: r.memoryItemDeletion.memoryId,
      }),
    },
    memoryItem: {
      user: r.one.user({
        from: r.memoryItem.creatorId,
        to: r.user.id,
      }),
      memory: r.one.memory({
        from: r.memoryItem.memoryId,
        to: r.memory.id,
      }),
      translatableElement: r.one.translatableElement({
        from: r.memoryItem.sourceElementId,
        to: r.translatableElement.id,
      }),
      vectorizedStringSourceStringId: r.one.vectorizedString({
        from: r.memoryItem.sourceStringId,
        to: r.vectorizedString.id,
      }),
      translation: r.one.translation({
        from: r.memoryItem.translationId,
        to: r.translation.id,
      }),
      vectorizedStringTranslationStringId: r.one.vectorizedString({
        from: r.memoryItem.translationStringId,
        to: r.vectorizedString.id,
      }),
      sourcePromotionRecords: r.many.memoryPromotionRecord({
        from: r.memoryItem.id,
        to: r.memoryPromotionRecord.sourcePersonalMemoryItemId,
      }),
      targetPromotionRecords: r.many.memoryPromotionRecord({
        from: r.memoryItem.id,
        to: r.memoryPromotionRecord.targetMemoryItemId,
      }),
    },
    personalMemoryBinding: {
      memory: r.one.memory({
        from: r.personalMemoryBinding.memoryId,
        to: r.memory.id,
      }),
      project: r.one.project({
        from: r.personalMemoryBinding.projectId,
        to: r.project.id,
      }),
      user: r.one.user({
        from: r.personalMemoryBinding.userId,
        to: r.user.id,
      }),
    },
    memoryPromotionRecord: {
      project: r.one.project({
        from: r.memoryPromotionRecord.projectId,
        to: r.project.id,
      }),
      sourceTranslation: r.one.translation({
        from: r.memoryPromotionRecord.sourceTranslationId,
        to: r.translation.id,
      }),
      sourcePersonalMemoryItem: r.one.memoryItem({
        from: r.memoryPromotionRecord.sourcePersonalMemoryItemId,
        to: r.memoryItem.id,
      }),
      targetMemory: r.one.memory({
        from: r.memoryPromotionRecord.targetMemoryId,
        to: r.memory.id,
      }),
      targetMemoryItem: r.one.memoryItem({
        from: r.memoryPromotionRecord.targetMemoryItemId,
        to: r.memoryItem.id,
      }),
      approvedBy: r.one.user({
        from: r.memoryPromotionRecord.approvedById,
        to: r.user.id,
      }),
    },
    memoryItemDeletion: {
      memory: r.one.memory({
        from: r.memoryItemDeletion.memoryId,
        to: r.memory.id,
      }),
      project: r.one.project({
        from: r.memoryItemDeletion.projectId,
        to: r.project.id,
      }),
      deletedBy: r.one.user({
        from: r.memoryItemDeletion.deletedById,
        to: r.user.id,
      }),
    },
    translatableElement: {
      user: r.one.user({
        from: r.translatableElement.creatorId,
        to: r.user.id,
      }),
      project: r.one.project({
        from: r.translatableElement.projectId,
        to: r.project.id,
      }),
      vectorizedString: r.one.vectorizedString({
        from: r.translatableElement.vectorizedStringId,
        to: r.vectorizedString.id,
      }),
      approvedTranslation: r.one.translation({
        from: r.translatableElement.approvedTranslationId,
        to: r.translation.id,
      }),
      contextEvidences: r.many.contextEvidence(),
      memoryItems: r.many.memoryItem({
        from: r.translatableElement.id,
        to: r.memoryItem.sourceElementId,
      }),
      translations: r.many.translation(),
    },
    vectorizedString: {
      memoryItemsSourceStringId: r.many.memoryItem({
        from: r.vectorizedString.id,
        to: r.memoryItem.sourceStringId,
      }),
      memoryItemsTranslationStringId: r.many.memoryItem({
        from: r.vectorizedString.id,
        to: r.memoryItem.translationStringId,
      }),
      termConcepts: r.many.termConcept(),
      translatableElements: r.many.translatableElement(),
      translations: r.many.translation(),
    },
    translation: {
      vectorizedString: r.one.vectorizedString({
        from: r.translation.stringId,
        to: r.vectorizedString.id,
      }),
      translatableElement: r.one.translatableElement({
        from: r.translation.translatableElementId,
        to: r.translatableElement.id,
      }),
      user: r.one.user({
        from: r.translation.translatorId,
        to: r.user.id,
      }),
      usersViaTranslationVote: r.many.user({
        from: r.translation.id.through(r.translationVote.translationId),
        to: r.user.id.through(r.translationVote.voterId),
      }),
      memoryItems: r.many.memoryItem({
        from: r.translation.id,
        to: r.memoryItem.translationId,
      }),
    },
    translationSnapshot: {
      project: r.one.project({
        from: r.translationSnapshot.projectId,
        to: r.project.id,
      }),
      creator: r.one.user({
        from: r.translationSnapshot.creatorId,
        to: r.user.id,
      }),
      snapshotItems: r.many.translationSnapshotItem(),
    },
    translationSnapshotItem: {
      snapshot: r.one.translationSnapshot({
        from: r.translationSnapshotItem.snapshotId,
        to: r.translationSnapshot.id,
      }),
      translation: r.one.translation({
        from: r.translationSnapshotItem.translationId,
        to: r.translation.id,
      }),
    },
    qaResult: {
      translation: r.one.translation({
        from: r.qaResult.translationId,
        to: r.translation.id,
      }),
    },
    qaResultItem: {
      result: r.one.qaResult({
        from: r.qaResultItem.resultId,
        to: r.qaResult.id,
      }),
      checker: r.one.pluginService({
        from: r.qaResultItem.checkerId,
        to: r.pluginService.id,
      }),
    },
    pluginConfig: {
      plugin: r.one.plugin({
        from: r.pluginConfig.pluginId,
        to: r.plugin.id,
      }),
      pluginConfigInstances: r.many.pluginConfigInstance(),
    },
    plugin: {
      pluginConfigs: r.many.pluginConfig(),
      pluginInstallations: r.many.pluginInstallation(),
    },
    pluginConfigInstance: {
      pluginConfig: r.one.pluginConfig({
        from: r.pluginConfigInstance.configId,
        to: r.pluginConfig.id,
      }),
      user: r.one.user({
        from: r.pluginConfigInstance.creatorId,
        to: r.user.id,
      }),
      pluginInstallation: r.one.pluginInstallation({
        from: r.pluginConfigInstance.pluginInstallationId,
        to: r.pluginInstallation.id,
      }),
    },
    pluginInstallation: {
      pluginConfigInstances: r.many.pluginConfigInstance(),
      plugin: r.one.plugin({
        from: r.pluginInstallation.pluginId,
        to: r.plugin.id,
      }),
      pluginServices: r.many.pluginService(),
      pluginComponents: r.many.pluginComponent(),
    },
    language: {
      projects: r.many.project({
        from: r.language.id.through(r.projectTargetLanguage.languageId),
        to: r.project.id.through(r.projectTargetLanguage.projectId),
      }),
      comments: r.many.comment({
        from: r.language.id,
        to: r.comment.languageId,
      }),
      chunkSets: r.many.chunkSet(),
    },
    term: {
      user: r.one.user({
        from: r.term.creatorId,
        to: r.user.id,
      }),
      language: r.one.language({
        from: r.term.languageId,
        to: r.language.id,
      }),
      termConcept: r.one.termConcept({
        from: r.term.termConceptId,
        to: r.termConcept.id,
      }),
    },
    termConcept: {
      glossary: r.one.glossary({
        from: r.termConcept.glossaryId,
        to: r.glossary.id,
      }),
      creator: r.one.user({
        from: r.termConcept.creatorId,
        to: r.user.id,
      }),
      vectorizedString: r.one.vectorizedString({
        from: r.termConcept.stringId,
        to: r.vectorizedString.id,
      }),
      termConceptToSubjects: r.many.termConceptToSubject(),
    },
    termConceptToSubject: {
      termConcept: r.one.termConcept({
        from: r.termConceptToSubject.termConceptId,
        to: r.termConcept.id,
      }),
      termConceptSubject: r.one.termConceptSubject({
        from: r.termConceptToSubject.subjectId,
        to: r.termConceptSubject.id,
      }),
    },
    termConceptSubject: {
      creator: r.one.user({
        from: r.termConceptSubject.creatorId,
        to: r.user.id,
      }),
      glossary: r.one.glossary({
        from: r.termConceptSubject.glossaryId,
        to: r.glossary.id,
      }),
      termConceptToSubjects: r.many.termConceptToSubject(),
    },
    comment: {
      language: r.one.language({
        from: r.comment.languageId,
        to: r.language.id,
      }),
      commentParentCommentId: r.one.comment({
        from: r.comment.parentCommentId,
        to: r.comment.id,
      }),
      commentsParentCommentId: r.many.comment({
        from: r.comment.id,
        to: r.comment.parentCommentId,
      }),
      commentRootCommentId: r.one.comment({
        from: r.comment.rootCommentId,
        to: r.comment.id,
      }),
      commentsRootCommentId: r.many.comment({
        from: r.comment.id,
        to: r.comment.rootCommentId,
      }),
      user: r.one.user({
        from: r.comment.userId,
        to: r.user.id,
      }),
      users: r.many.user({
        from: r.comment.id.through(r.commentReaction.commentId),
        to: r.user.id.through(r.commentReaction.userId),
      }),
    },

    // ─── Content Graph Relations ───

    contentNode: {
      project: r.one.project({
        from: r.contentNode.projectId,
        to: r.project.id,
      }),
      creator: r.one.user({
        from: r.contentNode.creatorId,
        to: r.user.id,
      }),
      language: r.one.language({
        from: r.contentNode.languageId,
        to: r.language.id,
      }),
      fileHandler: r.one.pluginService({
        from: r.contentNode.fileHandlerId,
        to: r.pluginService.id,
      }),
      file: r.one.file({
        from: r.contentNode.fileId,
        to: r.file.id,
      }),
      tasks: r.many.task({
        from: r.contentNode.id.through(r.contentNodeToTask.contentNodeId),
        to: r.task.id.through(r.contentNodeToTask.taskId),
      }),
      sourceRelations: r.many.contentRelation({
        from: r.contentNode.id,
        to: r.contentRelation.sourceNodeId,
      }),
      targetRelations: r.many.contentRelation({
        from: r.contentNode.id,
        to: r.contentRelation.targetNodeId,
      }),
      contextEvidences: r.many.contextEvidence(),
      scopeBindings: r.many.scopeBinding(),
    },
    contentRelationType: {
      ownerPlugin: r.one.plugin({
        from: r.contentRelationType.ownerPluginId,
        to: r.plugin.id,
      }),
      contentRelations: r.many.contentRelation(),
    },
    contentRelation: {
      project: r.one.project({
        from: r.contentRelation.projectId,
        to: r.project.id,
      }),
      relationType: r.one.contentRelationType({
        from: r.contentRelation.relationTypeId,
        to: r.contentRelationType.id,
      }),
      sourceNode: r.one.contentNode({
        from: r.contentRelation.sourceNodeId,
        to: r.contentNode.id,
      }),
      sourceElement: r.one.translatableElement({
        from: r.contentRelation.sourceElementId,
        to: r.translatableElement.id,
      }),
      targetNode: r.one.contentNode({
        from: r.contentRelation.targetNodeId,
        to: r.contentNode.id,
      }),
      targetElement: r.one.translatableElement({
        from: r.contentRelation.targetElementId,
        to: r.translatableElement.id,
      }),
      contextEvidences: r.many.contextEvidence(),
      scopeBindings: r.many.scopeBinding(),
    },
    contextEvidence: {
      project: r.one.project({
        from: r.contextEvidence.projectId,
        to: r.project.id,
      }),
      contentNode: r.one.contentNode({
        from: r.contextEvidence.contentNodeId,
        to: r.contentNode.id,
      }),
      contentRelation: r.one.contentRelation({
        from: r.contextEvidence.contentRelationId,
        to: r.contentRelation.id,
      }),
      translatableElement: r.one.translatableElement({
        from: r.contextEvidence.translatableElementId,
        to: r.translatableElement.id,
      }),
      file: r.one.file({
        from: r.contextEvidence.fileId,
        to: r.file.id,
      }),
      storageProvider: r.one.pluginService({
        from: r.contextEvidence.storageProviderId,
        to: r.pluginService.id,
      }),
    },
    contextProfile: {
      project: r.one.project({
        from: r.contextProfile.projectId,
        to: r.project.id,
      }),
    },
    scopeBinding: {
      project: r.one.project({
        from: r.scopeBinding.projectId,
        to: r.project.id,
      }),
      contentNode: r.one.contentNode({
        from: r.scopeBinding.contentNodeId,
        to: r.contentNode.id,
      }),
      contentRelation: r.one.contentRelation({
        from: r.scopeBinding.contentRelationId,
        to: r.contentRelation.id,
      }),
    },
    semanticDiffEntry: {
      project: r.one.project({
        from: r.semanticDiffEntry.projectId,
        to: r.project.id,
      }),
      changeset: r.one.changeset({
        from: r.semanticDiffEntry.changesetId,
        to: r.changeset.id,
      }),
      element: r.one.translatableElement({
        from: r.semanticDiffEntry.elementId,
        to: r.translatableElement.id,
      }),
      contentNode: r.one.contentNode({
        from: r.semanticDiffEntry.contentNodeId,
        to: r.contentNode.id,
      }),
      contentRelation: r.one.contentRelation({
        from: r.semanticDiffEntry.contentRelationId,
        to: r.contentRelation.id,
      }),
    },

    // ─── Agent System Relations ───

    agentDefinition: {
      sessions: r.many.agentSession(),
    },
    agentSession: {
      agentDefinition: r.one.agentDefinition({
        from: r.agentSession.agentDefinitionId,
        to: r.agentDefinition.id,
      }),
      currentRun: r.one.agentRun({
        from: r.agentSession.currentRunId,
        to: r.agentRun.id,
      }),
      user: r.one.user({
        from: r.agentSession.userId,
        to: r.user.id,
      }),
      runs: r.many.agentRun(),
      issue: r.one.issue({
        from: r.agentSession.issueId,
        to: r.issue.id,
      }),
      pullRequest: r.one.pullRequest({
        from: r.agentSession.pullRequestId,
        to: r.pullRequest.id,
      }),
    },
    agentRun: {
      session: r.one.agentSession({
        from: r.agentRun.sessionId,
        to: r.agentSession.id,
      }),
      events: r.many.agentEvent(),
      externalOutputs: r.many.agentExternalOutput(),
    },
    agentEvent: {
      run: r.one.agentRun({
        from: r.agentEvent.runId,
        to: r.agentRun.id,
      }),
    },
    agentExternalOutput: {
      run: r.one.agentRun({
        from: r.agentExternalOutput.runId,
        to: r.agentRun.id,
      }),
    },
    toolCallLog: {
      session: r.one.agentSession({
        from: r.toolCallLog.sessionId,
        to: r.agentSession.id,
      }),
      run: r.one.agentRun({
        from: r.toolCallLog.runId,
        to: r.agentRun.id,
      }),
    },
    apiKey: {
      user: r.one.user({
        from: r.apiKey.userId,
        to: r.user.id,
      }),
    },
    sessionRecord: {
      user: r.one.user({
        from: r.sessionRecord.userId,
        to: r.user.id,
      }),
    },
    notification: {
      recipient: r.one.user({
        from: r.notification.recipientId,
        to: r.user.id,
      }),
    },
    userMessagePreference: {
      user: r.one.user({
        from: r.userMessagePreference.userId,
        to: r.user.id,
      }),
    },

    // ─── Issue + PR System Relations ───

    projectSequence: {
      project: r.one.project({
        from: r.projectSequence.projectId,
        to: r.project.id,
      }),
    },
    issue: {
      project: r.one.project({
        from: r.issue.projectId,
        to: r.project.id,
      }),
      author: r.one.user({
        from: r.issue.authorId,
        to: r.user.id,
      }),
      authorAgent: r.one.agentDefinition({
        from: r.issue.authorAgentId,
        to: r.agentDefinition.id,
      }),
      labels: r.many.issueLabel(),
      parentIssue: r.one.issue({
        from: r.issue.parentIssueId,
        to: r.issue.id,
      }),
      childIssues: r.many.issue({
        from: r.issue.id,
        to: r.issue.parentIssueId,
      }),
      pullRequests: r.many.pullRequest(),
      commentThreads: r.many.issueCommentThread({
        from: r.issue.id,
        to: r.issueCommentThread.targetId,
      }),
    },
    issueLabel: {
      issue: r.one.issue({
        from: r.issueLabel.issueId,
        to: r.issue.id,
      }),
    },
    pullRequest: {
      project: r.one.project({
        from: r.pullRequest.projectId,
        to: r.project.id,
      }),
      author: r.one.user({
        from: r.pullRequest.authorId,
        to: r.user.id,
      }),
      authorAgent: r.one.agentDefinition({
        from: r.pullRequest.authorAgentId,
        to: r.agentDefinition.id,
      }),
      issue: r.one.issue({
        from: r.pullRequest.issueId,
        to: r.issue.id,
      }),
      entityBranch: r.one.entityBranch({
        from: r.pullRequest.branchId,
        to: r.entityBranch.id,
      }),
      commentThreads: r.many.issueCommentThread({
        from: r.pullRequest.id,
        to: r.issueCommentThread.targetId,
      }),
    },
    entityBranch: {
      project: r.one.project({
        from: r.entityBranch.projectId,
        to: r.project.id,
      }),
      creator: r.one.user({
        from: r.entityBranch.createdBy,
        to: r.user.id,
      }),
      creatorAgent: r.one.agentDefinition({
        from: r.entityBranch.createdByAgentId,
        to: r.agentDefinition.id,
      }),
      pullRequests: r.many.pullRequest(),
      changesets: r.many.changeset(),
    },
    issueCommentThread: {
      comments: r.many.issueComment(),
    },
    issueComment: {
      thread: r.one.issueCommentThread({
        from: r.issueComment.threadId,
        to: r.issueCommentThread.id,
      }),
      author: r.one.user({
        from: r.issueComment.authorId,
        to: r.user.id,
      }),
      authorAgent: r.one.agentDefinition({
        from: r.issueComment.authorAgentId,
        to: r.agentDefinition.id,
      }),
    },
    changeset: {
      pullRequest: r.one.pullRequest({
        from: r.changeset.pullRequestId,
        to: r.pullRequest.id,
      }),
      entityBranch: r.one.entityBranch({
        from: r.changeset.branchId,
        to: r.entityBranch.id,
      }),
    },
  }));
