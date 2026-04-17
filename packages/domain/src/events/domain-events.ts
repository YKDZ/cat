import type { MessageCategory, MessageChannel } from "@cat/shared/schema/enum";
import type { JSONType } from "@cat/shared/schema/json";

import { createEvent, type AnyEventOf, type EventOf } from "@cat/core";

export type DomainEventMap = {
  "setting:updated": { key: string };
  "user:created": { userId: string };
  "user:updated": { userId: string };
  "translation:created": { documentId: string; translationIds: number[] };
  "translation:updated": { translationIds: number[] };
  "translation:deleted": { translationIds: number[] };
  "term:created": { glossaryId: string; termIds: number[] };
  "term:updated": { glossaryId: string; termIds: number[] };
  "term:deleted": { glossaryId: string; termIds: number[] };
  "concept:updated": { conceptId: number };
  "concept:revectorized": { conceptId: number };
  "document:created": { projectId: string; documentId: string };
  "document:updated": { documentId: string };
  "document:deleted": { documentId: string };
  "element:created": { documentId: string; elementIds: number[] };
  "project:created": { projectId: string; creatorId: string };
  "project:updated": { projectId: string };
  "project:deleted": { projectId: string };
  "glossary:created": { glossaryId: string; creatorId: string };
  "memory:created": { memoryId: string; creatorId: string };
  "comment:created": { commentId: number };
  "comment:updated": { commentId: number };
  "comment:deleted": { commentId: number };
  "memory:item:created": { memoryId: string; itemIds: number[] };
  "qa:completed": { documentId: string; issueCount: number };
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
