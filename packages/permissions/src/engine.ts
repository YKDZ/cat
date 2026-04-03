import type { CacheStore, DbHandle } from "@cat/domain";
import type {
  ObjectType,
  Relation,
  SubjectType,
} from "@cat/shared/schema/permission";

import {
  executeCommand,
  executeQuery,
  getSubjectPermissionTuples,
  grantPermissionTuple,
  listPermissionObjects,
  listPermissionSubjects,
  revokePermissionTuple,
} from "@cat/domain";

import type { AuthContext, ObjectRef, SubjectRef } from "@/types";

import { auditEventBus } from "@/audit";
import { createPermissionCache } from "@/cache";
import { isRelationImplied, relationHierarchy } from "@/relations";

export type PermissionEngine = {
  check: (
    authCtx: AuthContext,
    object: ObjectRef,
    relation: Relation,
    requiredAAL?: number,
  ) => Promise<boolean>;
  filterAuthorized: <T>(
    authCtx: AuthContext,
    items: T[],
    getObjectRef: (item: T) => ObjectRef,
    relation: Relation,
  ) => Promise<T[]>;
  grant: (
    subject: SubjectRef,
    relation: Relation,
    object: ObjectRef,
  ) => Promise<void>;
  revoke: (
    subject: SubjectRef,
    relation: Relation,
    object: ObjectRef,
  ) => Promise<void>;
  listSubjects: (
    object: ObjectRef,
    filterRelation?: Relation,
  ) => Promise<Array<SubjectRef & { relation: Relation }>>;
  listObjects: (
    subject: SubjectRef,
    objectType: ObjectType,
    filterRelation?: Relation,
  ) => Promise<Array<{ id: string; relation: Relation }>>;
};

type TupleRelationRow = { relation: Relation };
type TupleSubjectRow = {
  subjectType: SubjectType;
  subjectId: string;
  relation: Relation;
};
type TupleObjectRow = { objectId: string; relation: Relation };

export const createPermissionEngine = (deps: {
  db: DbHandle;
  cache: CacheStore;
  auditEnabled: boolean;
}): PermissionEngine => {
  const { db, cache, auditEnabled } = deps;
  const permCache = createPermissionCache(cache);

  /**
   * 检查 authCtx 对应的主体是否对 object 持有 relation（或更高权限）。
   * 流程：
   * 1. superadmin bypass
   * 2. 缓存命中
   * 3. 查 DB 元组（含层级扩展）
   * 4. 写缓存 + 写审计
   */
  const check = async (
    authCtx: AuthContext,
    object: ObjectRef,
    requiredRelation: Relation,
    requiredAAL?: number,
  ): Promise<boolean> => {
    // 0.5. AAL 检查：若指定最低 AAL，验证当前会话的 AAL 是否足够
    if (requiredAAL !== undefined && requiredAAL > 0) {
      const currentAAL = authCtx.aal ?? 0;
      if (currentAAL < requiredAAL) return false;
    }

    // 0. API Key scope 检查：若 scopes 不为 null（API Key 认证），验证 scope 匹配
    if (authCtx.scopes !== null) {
      const requiredScope = `${object.type}:${requiredRelation}`;
      const hasScopeMatch = authCtx.scopes.some(
        (s) => s === requiredScope || s === `${object.type}:*` || s === "*",
      );
      if (!hasScopeMatch) return false;
    }

    // 1. superadmin bypass
    if (authCtx.systemRoles.includes("superadmin")) {
      if (auditEnabled) {
        void auditEventBus.publish({
          eventId: crypto.randomUUID(),
          type: "permission:checked",
          payload: {
            subjectType: authCtx.subjectType,
            subjectId: authCtx.subjectId,
            action: "check",
            relation: requiredRelation,
            objectType: object.type,
            objectId: object.id,
            result: true,
            traceId: authCtx.traceId,
            ip: authCtx.ip,
            userAgent: authCtx.userAgent,
          },
          timestamp: new Date().toISOString(),
          traceId: authCtx.traceId,
        });
      }
      return true;
    }

    // 2. 缓存命中
    const cached = await permCache.getCheckResult(
      authCtx.subjectType,
      authCtx.subjectId,
      requiredRelation,
      object.type,
      object.id,
    );
    if (cached !== null) return cached;

    // 3. 查 DB：获取主体对该 object 持有的所有关系元组
    const tuples = await executeQuery({ db }, getSubjectPermissionTuples, {
      subjectType: authCtx.subjectType,
      subjectId: authCtx.subjectId,
      objectType: object.type,
      objectId: object.id,
    });

    // 4. 检查层级：持有任何一个更高或相等层级的关系即满足
    const result = (tuples as TupleRelationRow[]).some((tuple) =>
      isRelationImplied(object.type, tuple.relation, requiredRelation),
    );

    // 5. 写缓存
    await permCache.setCheckResult(
      authCtx.subjectType,
      authCtx.subjectId,
      requiredRelation,
      object.type,
      object.id,
      result,
    );

    // 6. 写审计
    if (auditEnabled) {
      void auditEventBus.publish({
        eventId: crypto.randomUUID(),
        type: "permission:checked",
        payload: {
          subjectType: authCtx.subjectType,
          subjectId: authCtx.subjectId,
          action: "check",
          relation: requiredRelation,
          objectType: object.type,
          objectId: object.id,
          result,
          traceId: authCtx.traceId,
          ip: authCtx.ip,
          userAgent: authCtx.userAgent,
        },
        timestamp: new Date().toISOString(),
        traceId: authCtx.traceId,
      });
    }

    return result;
  };

  /**
   * 批量鉴权（列表过滤场景）。
   * 对每个 item 调用 check，过滤出有权限的项。
   */
  const filterAuthorized = async <T>(
    authCtx: AuthContext,
    items: T[],
    getObjectRef: (item: T) => ObjectRef,
    relation: Relation,
  ): Promise<T[]> => {
    if (authCtx.systemRoles.includes("superadmin")) return items;
    const results = await Promise.all(
      items.map(async (item) => check(authCtx, getObjectRef(item), relation)),
    );
    return items.filter((_, i) => results[i]);
  };

  /** 授予关系元组 + 清除缓存 */
  const grant = async (
    subject: SubjectRef,
    relation: Relation,
    object: ObjectRef,
  ): Promise<void> => {
    await executeCommand({ db }, grantPermissionTuple, {
      subjectType: subject.type,
      subjectId: subject.id,
      relation,
      objectType: object.type,
      objectId: object.id,
    });

    await permCache.invalidate(
      subject.type,
      subject.id,
      object.type,
      object.id,
    );

    if (auditEnabled) {
      void auditEventBus.publish({
        eventId: crypto.randomUUID(),
        type: "permission:granted",
        payload: {
          subjectType: subject.type,
          subjectId: subject.id,
          action: "grant",
          relation,
          objectType: object.type,
          objectId: object.id,
        },
        timestamp: new Date().toISOString(),
      });
    }
  };

  /** 撤销关系元组 + 清除缓存 */
  const revoke = async (
    subject: SubjectRef,
    relation: Relation,
    object: ObjectRef,
  ): Promise<void> => {
    await executeCommand({ db }, revokePermissionTuple, {
      subjectType: subject.type,
      subjectId: subject.id,
      relation,
      objectType: object.type,
      objectId: object.id,
    });

    await permCache.invalidate(
      subject.type,
      subject.id,
      object.type,
      object.id,
    );

    if (auditEnabled) {
      void auditEventBus.publish({
        eventId: crypto.randomUUID(),
        type: "permission:revoked",
        payload: {
          subjectType: subject.type,
          subjectId: subject.id,
          action: "revoke",
          relation,
          objectType: object.type,
          objectId: object.id,
        },
        timestamp: new Date().toISOString(),
      });
    }
  };

  /** 列出某资源的所有授权主体 */
  const listSubjects = async (
    object: ObjectRef,
    filterRelation?: Relation,
  ): Promise<Array<SubjectRef & { relation: Relation }>> => {
    const tuples = await executeQuery({ db }, listPermissionSubjects, {
      objectType: object.type,
      objectId: object.id,
      filterRelation,
    });

    return (tuples as TupleSubjectRow[]).map((t) => ({
      type: t.subjectType,
      id: t.subjectId,
      relation: t.relation,
    }));
  };

  /** 列出某主体可访问的所有特定类型资源 */
  const listObjects = async (
    subject: SubjectRef,
    objectType: ObjectType,
    filterRelation?: Relation,
  ): Promise<Array<{ id: string; relation: Relation }>> => {
    const hierarchy = relationHierarchy[objectType];

    // 计算需要查询的所有关系（包含更高层级）
    let relationsToQuery: Relation[];
    if (filterRelation && hierarchy) {
      const idx = hierarchy.indexOf(filterRelation);
      relationsToQuery =
        idx >= 0 ? hierarchy.slice(0, idx + 1) : [filterRelation];
    } else if (filterRelation) {
      relationsToQuery = [filterRelation];
    } else if (hierarchy) {
      relationsToQuery = hierarchy;
    } else {
      relationsToQuery = [];
    }

    const tuples = await executeQuery({ db }, listPermissionObjects, {
      subjectType: subject.type,
      subjectId: subject.id,
      objectType,
      filterRelations:
        relationsToQuery.length > 0 ? relationsToQuery : undefined,
    });

    return (tuples as TupleObjectRow[]).map((t) => ({
      id: t.objectId,
      relation: t.relation,
    }));
  };

  return { check, filterAuthorized, grant, revoke, listSubjects, listObjects };
};
