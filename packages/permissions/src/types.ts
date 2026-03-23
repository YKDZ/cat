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
