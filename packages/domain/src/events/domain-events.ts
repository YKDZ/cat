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
};

export type DomainEvent = AnyEventOf<DomainEventMap>;
export type DomainEventType = keyof DomainEventMap;

export const domainEvent = <T extends DomainEventType>(
  type: T,
  payload: DomainEventMap[T],
): EventOf<DomainEventMap, T> => createEvent(type, payload);
