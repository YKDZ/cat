import type {
  ObjectType,
  Relation,
  SubjectType,
} from "@cat/shared/schema/permission";

/** 鉴权上下文，在各入口层创建后透传 */
export type AuthContext = {
  subjectType: SubjectType;
  subjectId: string;
  /** 预加载的系统角色列表 */
  systemRoles: Relation[];
  /**
   * API Key 范围限制。
   * - null: 全权限（Cookie Session 认证）
   * - string[]: 受限范围（API Key 认证），格式如 "project:viewer"
   */
  scopes: string[] | null;
  traceId?: string;
  ip?: string;
  userAgent?: string;
};

/** 引用某个具体对象 */
export type ObjectRef = {
  type: ObjectType;
  id: string;
};

/** 引用某个主体 */
export type SubjectRef = {
  type: SubjectType;
  id: string;
};
