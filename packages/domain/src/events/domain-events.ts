import type {
  MessageCategory,
  MessageChannel,
  QaReviewQueueStatus,
} from "@cat/shared";
import type { JSONType } from "@cat/shared";

import { createEvent, type AnyEventOf, type EventOf } from "@cat/core";

export type DomainEventMap = {
  "setting:updated": { key: string };
  "user:created": { userId: string };
  "user:updated": { userId: string };
  "translation:created": {
    projectId: string;
    translationIds: number[];
    elementIds: number[];
    primaryContentNodeIds: string[];
  };
  "translation:updated": { translationIds: number[] };
  "translation:deleted": { translationIds: number[] };
  "term:created": { glossaryId: string; termIds: number[] };
  "term:updated": { glossaryId: string; termIds: number[] };
  "term:deleted": { glossaryId: string; termIds: number[] };
  "concept:updated": { conceptId: number };
  "concept:revectorized": { conceptId: number };
  "content-node:created": {
    projectId: string;
    contentNodeId: string;
  };
  "content-node:deleted": {
    projectId: string;
    contentNodeId: string;
  };
  "content-relation:created": {
    projectId: string;
    sourceContentNodeId?: string;
    targetContentNodeId?: string;
    targetElementId?: number;
  };
  "content-relation:deleted": {
    projectId: string;
    contentRelationId: string;
  };
  "element:created": {
    projectId: string;
    primaryContentNodeId: string;
    elementIds: number[];
  };
  "project:created": { projectId: string; creatorId: string };
  "project:updated": { projectId: string };
  "project:deleted": { projectId: string };
  "glossary:created": { glossaryId: string; creatorId: string };
  "memory:created": { memoryId: string; creatorId: string };
  "comment:created": { commentId: number };
  "comment:updated": { commentId: number };
  "comment:deleted": { commentId: number };
  "memory:item:created": { memoryId: string; itemIds: number[] };
  "qa:completed": {
    projectId: string;
    elementIds: number[];
    issueCount: number;
  };
  "qa-review:run-completed": {
    projectId: string;
    elementId: number;
    translationId?: number;
    runId: number;
    findingCount: number;
    maxRiskScore: number;
  };
  "qa-review:queue-updated": {
    projectId: string;
    queueItemId: number;
    status: QaReviewQueueStatus;
    riskScore: number;
    previousStatus?: QaReviewQueueStatus;
  };
  "qa-review:annotation-created": {
    projectId: string;
    queueItemId: number;
    annotationId: number;
    intent: string;
    authorId?: string;
  };
  "qa-review:suggestion-created": {
    projectId: string;
    queueItemId: number;
    suggestionId: number;
    annotationId: number;
    authorId?: string;
  };
  "qa-review:suggestion-applied": {
    projectId: string;
    queueItemId: number;
    suggestionId: number;
    appliedTranslationId?: number;
    appliedChangesetEntryId?: number;
    userId?: string;
  };
  "qa-review:suggestion-rejected": {
    projectId: string;
    queueItemId: number;
    suggestionId: number;
    annotationId: number;
    rejectedBy?: string;
  };
  "qa-review:decision-submitted": {
    projectId: string;
    queueItemId: number;
    decisionId: number;
    decision: string;
    reviewerId?: string;
  };
  "qa-review:context-promoted": {
    projectId: string;
    elementId: number;
    contextEvidenceId: number;
    annotationId?: number;
    decisionId?: number;
  };
  // ─── Vectorization ───
  "vectorization:enqueued": { stringIds: number[]; taskId: string };
  "vectorization:completed": { stringIds: number[]; taskId: string };
  "vectorization:failed": {
    stringIds: number[];
    taskId: string;
    error: unknown;
  };
  // ─── Message System ───
  "message:send-requested": {
    recipientId: string;
    category: MessageCategory;
    title: string;
    body: string;
    data?: JSONType;
    channels?: MessageChannel[];
  };
  "notification:created": {
    notificationId: number;
    recipientId: string;
    category: string;
    title: string;
    body: string;
    data?: JSONType;
  };
  "notification:status-changed": {
    notificationId: number;
    recipientId: string;
    status: string;
  };
  // ─── Issue System ───
  "issue:created": { projectId: string; issueId: number; number: number };
  "issue:updated": { issueId: number };
  "issue:closed": { issueId: number; closedByPRId?: number };
  "issue:reopened": { issueId: number };
  "issue:assigned": {
    issueId: number;
    assignees: Array<{ type: string; id: string }>;
  };
  "issue:claimed": { issueId: number; claimedBy: string };
  // ─── PR System ───
  "pr:created": {
    projectId: string;
    prId: number;
    number: number;
    issueId?: number;
  };
  "pr:updated": { prId: number };
  "pr:status-changed": { prId: number; oldStatus: string; newStatus: string };
  "pr:merged": { prId: number; issueId?: number; mergedBy: string };
  "pr:closed": { prId: number };
  "pr:review-submitted": {
    prId: number;
    reviewerId: string;
    decision: string;
  };
  // ─── Issue Comment System ───
  "issue-comment:created": {
    threadId: number;
    commentId: number;
    targetType: string;
    targetId: number;
  };
};

export type DomainEvent = AnyEventOf<DomainEventMap>;
export type DomainEventType = keyof DomainEventMap;

export const domainEvent = <T extends DomainEventType>(
  type: T,
  payload: DomainEventMap[T],
): EventOf<DomainEventMap, T> => createEvent(type, payload);
