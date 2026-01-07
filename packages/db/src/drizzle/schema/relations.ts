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
      documents: r.many.document(),
      glossaries: r.many.glossary(),
      memories: r.many.memory(),
      memoryItems: r.many.memoryItem({
        from: r.user.id,
        to: r.memoryItem.creatorId,
      }),
      pluginConfigInstances: r.many.pluginConfigInstance(),
      projects: r.many.project(),
      rolesCreatorId: r.many.role({
        from: r.user.id,
        to: r.role.creatorId,
      }),
      terms: r.many.term(),
      translatableElements: r.many.translatableElement(),
      translatableElementCommentsUserId: r.many.translatableElementComment({
        from: r.user.id,
        to: r.translatableElementComment.userId,
      }),
      translatableElementCommentsViaTranslatableElementCommentReaction:
        r.many.translatableElementComment({
          from: r.user.id,
          to: r.translatableElementComment.userId,
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
      rolesViaUserRole: r.many.role({
        from: r.user.id.through(r.userRole.userId),
        to: r.role.id.through(r.userRole.roleId),
      }),
      mfaProvider: r.many.mfaProvider({
        from: r.user.id,
        to: r.mfaProvider.userId,
      }),
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
      documents: r.many.document(),
      translatableElementContexts: r.many.translatableElementContext(),
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
        from: r.chunkSet.id.through(r.translatableString.chunkSetId),
        to: r.language.id.through(r.translatableString.languageId),
      }),
    },
    document: {
      user: r.one.user({
        from: r.document.creatorId,
        to: r.user.id,
      }),
      pluginService: r.one.pluginService({
        from: r.document.fileHandlerId,
        to: r.pluginService.id,
      }),
      file: r.one.file({
        from: r.document.fileId,
        to: r.file.id,
      }),
      project: r.one.project({
        from: r.document.projectId,
        to: r.project.id,
      }),
      documentClosuresAncestor: r.many.documentClosure({
        from: r.document.id,
        to: r.documentClosure.ancestor,
      }),
      documentClosuresDescendant: r.many.documentClosure({
        from: r.document.id,
        to: r.documentClosure.descendant,
      }),
      tasks: r.many.task({
        from: r.document.id.through(r.documentToTask.documentId),
        to: r.task.id.through(r.documentToTask.taskId),
      }),
      translatableElements: r.many.translatableElement(),
    },
    file: {
      documents: r.many.document(),
      blob: r.one.blob({
        from: r.file.blobId,
        to: r.blob.id,
      }),
      translatableElementContexts: r.many.translatableElementContext(),
      users: r.many.user(),
    },
    project: {
      documents: r.many.document(),
      documentClosures: r.many.documentClosure(),
      glossaries: r.many.glossary(),
      memories: r.many.memory(),
      user: r.one.user({
        from: r.project.creatorId,
        to: r.user.id,
      }),
      languages: r.many.language(),
      snapshots: r.many.translationSnapshot(),
    },
    documentClosure: {
      documentAncestor: r.one.document({
        from: r.documentClosure.ancestor,
        to: r.document.id,
      }),
      documentDescendant: r.one.document({
        from: r.documentClosure.descendant,
        to: r.document.id,
      }),
      project: r.one.project({
        from: r.documentClosure.projectId,
        to: r.project.id,
      }),
    },
    task: {
      documents: r.many.document(),
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
      termEntries: r.many.termEntry(),
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
      translatableStringSourceStringId: r.one.translatableString({
        from: r.memoryItem.sourceStringId,
        to: r.translatableString.id,
      }),
      translation: r.one.translation({
        from: r.memoryItem.translationId,
        to: r.translation.id,
      }),
      translatableStringTranslationStringId: r.one.translatableString({
        from: r.memoryItem.translationStringId,
        to: r.translatableString.id,
      }),
    },
    translatableElement: {
      user: r.one.user({
        from: r.translatableElement.creatorId,
        to: r.user.id,
      }),
      document: r.one.document({
        from: r.translatableElement.documentId,
        to: r.document.id,
      }),
      translatableString: r.one.translatableString({
        from: r.translatableElement.translatableStringId,
        to: r.translatableString.id,
      }),
      approvedTranslation: r.one.translation({
        from: r.translatableElement.approvedTranslationId,
        to: r.translation.id,
      }),
      translatableElementComments: r.many.translatableElementComment({
        from: r.translatableElement.id,
        to: r.translatableElementComment.translatableElementId,
      }),
      translatableElementContexts: r.many.translatableElementContext(),
      memoryItems: r.many.memoryItem({
        from: r.translatableElement.id,
        to: r.memoryItem.sourceElementId,
      }),
      translations: r.many.translation(),
    },
    translatableString: {
      memoryItemsSourceStringId: r.many.memoryItem({
        from: r.translatableString.id,
        to: r.memoryItem.sourceStringId,
      }),
      memoryItemsTranslationStringId: r.many.memoryItem({
        from: r.translatableString.id,
        to: r.memoryItem.translationStringId,
      }),
      terms: r.many.term(),
      translatableElements: r.many.translatableElement(),
      translations: r.many.translation(),
    },
    translation: {
      translatableString: r.one.translatableString({
        from: r.translation.stringId,
        to: r.translatableString.id,
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
    permission: {
      permissionTemplate: r.one.permissionTemplate({
        from: r.permission.templateId,
        to: r.permissionTemplate.id,
      }),
      roles: r.many.role({
        from: r.permission.id.through(r.rolePermission.permissionId),
        to: r.role.id.through(r.rolePermission.roleId),
      }),
    },
    permissionTemplate: {
      permissions: r.many.permission(),
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
      translatableElementComments: r.many.translatableElementComment({
        from: r.language.id,
        to: r.translatableElementComment.languageId,
      }),
      chunkSets: r.many.chunkSet(),
    },
    role: {
      user: r.one.user({
        from: r.role.creatorId,
        to: r.user.id,
      }),
      permissions: r.many.permission(),
      users: r.many.user({
        from: r.role.id.through(r.userRole.roleId),
        to: r.user.id.through(r.userRole.userId),
      }),
    },
    term: {
      user: r.one.user({
        from: r.term.creatorId,
        to: r.user.id,
      }),
      translatableString: r.one.translatableString({
        from: r.term.stringId,
        to: r.translatableString.id,
      }),
      termEntry: r.one.termEntry({
        from: r.term.termEntryId,
        to: r.termEntry.id,
      }),
    },
    termEntry: {
      glossary: r.one.glossary({
        from: r.termEntry.glossaryId,
        to: r.glossary.id,
      }),
    },
    translatableElementComment: {
      language: r.one.language({
        from: r.translatableElementComment.languageId,
        to: r.language.id,
      }),
      translatableElementCommentParentCommentId:
        r.one.translatableElementComment({
          from: r.translatableElementComment.parentCommentId,
          to: r.translatableElementComment.id,
        }),
      translatableElementCommentsParentCommentId:
        r.many.translatableElementComment({
          from: r.translatableElementComment.id,
          to: r.translatableElementComment.parentCommentId,
        }),
      translatableElementCommentRootCommentId: r.one.translatableElementComment(
        {
          from: r.translatableElementComment.rootCommentId,
          to: r.translatableElementComment.id,
        },
      ),
      translatableElementCommentsRootCommentId:
        r.many.translatableElementComment({
          from: r.translatableElementComment.id,
          to: r.translatableElementComment.rootCommentId,
        }),
      translatableElement: r.one.translatableElement({
        from: r.translatableElementComment.translatableElementId,
        to: r.translatableElement.id,
      }),
      user: r.one.user({
        from: r.translatableElementComment.userId,
        to: r.user.id,
      }),
      users: r.many.user({
        from: r.translatableElementComment.id.through(
          r.translatableElementCommentReaction.translatableElementCommentId,
        ),
        to: r.user.id.through(r.translatableElementCommentReaction.userId),
      }),
    },
    translatableElementContext: {
      file: r.one.file({
        from: r.translatableElementContext.fileId,
        to: r.file.id,
      }),
      pluginService: r.one.pluginService({
        from: r.translatableElementContext.storageProviderId,
        to: r.pluginService.id,
      }),
      translatableElement: r.one.translatableElement({
        from: r.translatableElementContext.translatableElementId,
        to: r.translatableElement.id,
      }),
    },
    vector: {
      chunk: r.one.chunk({
        from: r.vector.chunkId,
        to: r.chunk.id,
      }),
    },
    chunk: {
      vectors: r.many.vector(),
    },
  }));
