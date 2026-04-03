import type { DbHandle } from "@cat/domain";
import type {
  ObjectType,
  Relation,
  SubjectType,
} from "@cat/shared/schema/permission";

import { InProcessEventBus, type AnyEventOf } from "@cat/core";
import { executeCommand } from "@cat/domain";
import { insertAuditLogs } from "@cat/domain";
import {
  ObjectTypeSchema,
  PermissionActionSchema,
  RelationSchema,
  SubjectTypeSchema,
} from "@cat/shared/schema/permission";

export type AuditEventMap = {
  "permission:checked": {
    subjectType: SubjectType;
    subjectId: string;
    action: "check";
    relation: Relation;
    objectType: ObjectType;
    objectId: string;
    result: boolean;
    traceId?: string;
    ip?: string;
    userAgent?: string;
  };
  "permission:granted": {
    subjectType: SubjectType;
    subjectId: string;
    action: "grant";
    relation: Relation;
    objectType: ObjectType;
    objectId: string;
    traceId?: string;
  };
  "permission:revoked": {
    subjectType: SubjectType;
    subjectId: string;
    action: "revoke";
    relation: Relation;
    objectType: ObjectType;
    objectId: string;
    traceId?: string;
  };
};

export type AuditEvent = AnyEventOf<AuditEventMap>;
export type AuditEventType = keyof AuditEventMap;

// 单例审计事件总线
export const auditEventBus = new InProcessEventBus<
  AuditEventType,
  AuditEvent
>();

type AuditLogInsert = {
  subjectType: SubjectType;
  subjectId: string;
  action: "check" | "grant" | "revoke";
  relation: Relation;
  objectType: ObjectType;
  objectId: string;
  result: boolean;
  traceId?: string;
  ip?: string;
  userAgent?: string;
};

const toAuditLogRow = (event: AuditEvent): AuditLogInsert => {
  const payload = event.payload;
  return {
    subjectType: SubjectTypeSchema.parse(payload.subjectType),
    subjectId: payload.subjectId,
    action: PermissionActionSchema.parse(payload.action),
    objectType: ObjectTypeSchema.parse(payload.objectType),
    objectId: payload.objectId,
    relation: RelationSchema.parse(payload.relation),
    result: event.type === "permission:checked" ? event.payload.result : true,
    traceId: payload.traceId,
    ip: event.type === "permission:checked" ? event.payload.ip : undefined,
    userAgent:
      event.type === "permission:checked" ? event.payload.userAgent : undefined,
  };
};

/**
 * 注册 handler：批量写入 authAuditLog 表。
 * 使用微批处理（收集 50 条或每 5 秒，一次 batch insert）。
 */
export const registerAuditHandler = (db: DbHandle): (() => void) => {
  let buffer: AuditEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = async (): Promise<void> => {
    if (buffer.length === 0) return;
    const eventsToFlush = [...buffer];
    buffer = [];
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    try {
      await executeCommand({ db }, insertAuditLogs, {
        entries: eventsToFlush.map(toAuditLogRow),
      });
    } catch {
      // 审计写入失败不应阻断业务逻辑，静默处理
    }
  };

  const unsubscribe = auditEventBus.subscribeAll(async (event) => {
    buffer.push(event);
    if (buffer.length >= 50) {
      await flush();
    } else if (!timer) {
      timer = setTimeout(() => {
        void flush();
      }, 5000);
    }
  });

  return unsubscribe;
};
