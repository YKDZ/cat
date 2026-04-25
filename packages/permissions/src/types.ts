import type { ObjectType, Relation, SubjectType } from "@cat/shared";

/** 完成的认证因子信息 */
export type CompletedFactor = {
  factorType: string;
  factorId: string;
  completedAt: string;
  aal: number;
};

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
  /** 认证保证等级 (Authenticator Assurance Level)：0=无、1=密码、2=MFA */
  aal?: number;
  /** 本次会话完成的认证因子列表 */
  completedFactors?: CompletedFactor[];
  /** 创建此会话时的认证流 flowId（用于追踪） */
  flowTraceId?: string;
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
