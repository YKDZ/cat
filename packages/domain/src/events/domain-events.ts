import {
  createEvent,
  type AnyEventOf,
  type EventOf,
} from "@/events/typed-event-bus";

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
  "project:created": { projectId: string };
  "project:updated": { projectId: string };
  "project:deleted": { projectId: string };
  "glossary:created": { glossaryId: string };
  "memory:created": { memoryId: string };
  "comment:created": { commentId: number };
  "comment:updated": { commentId: number };
  "comment:deleted": { commentId: number };
  "memory:item:created": { memoryId: string; itemIds: number[] };
  "qa:completed": { documentId: string; issueCount: number };
};

export type DomainEvent = AnyEventOf<DomainEventMap>;
export type DomainEventType = keyof DomainEventMap;

export const domainEvent = <T extends DomainEventType>(
  type: T,
  payload: DomainEventMap[T],
): EventOf<DomainEventMap, T> => createEvent<DomainEventMap, T>(type, payload);
