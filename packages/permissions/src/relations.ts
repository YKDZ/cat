import type { DbHandle } from "@cat/domain";
import type { ObjectType, Relation } from "@cat/shared/schema/permission";

/**
 * 每种资源类型上的关系继承层级，从高到低。
 * 拥有更高层级关系隐含拥有所有更低层级关系。
 */
export const relationHierarchy: Partial<Record<ObjectType, Relation[]>> = {
  system: ["superadmin", "admin", "member", "viewer"],
  project: ["owner", "admin", "editor", "viewer"],
  document: ["editor", "viewer"],
  glossary: ["owner", "editor", "viewer"],
  memory: ["owner", "editor", "viewer"],
  agent_definition: ["owner", "editor", "viewer"],
};

/**
 * 跨资源传递性规则。
 * 语义：如果 subject 对 parentObject 有 parentRelation，
 *       则隐含对 childObject 有 childRelation。
 * resolveParentId：给定 child object ID，查 DB 返回 parent object ID。
 */
export type TransitiveRule = {
  parentObjectType: ObjectType;
  parentRelation: Relation;
  childObjectType: ObjectType;
  childRelation: Relation;
  resolveParentId: (
    childObjectId: string,
    db: DbHandle,
  ) => Promise<string | null>;
};

/**
 * "上溯"规则：element/translation 没有自己的权限元组，
 * 鉴权时自动查找所属 document。
 */
export type AscendRule = {
  childObjectType: ObjectType;
  parentObjectType: ObjectType;
  resolveParentId: (
    childObjectId: string,
    db: DbHandle,
  ) => Promise<string | null>;
};

/**
 * 检查 requiredRelation 是否被 heldRelation 隐含（同一资源类型内）。
 * 例如：持有 "owner" 即隐含 "editor" 和 "viewer"。
 */
export const isRelationImplied = (
  objectType: ObjectType,
  heldRelation: Relation,
  requiredRelation: Relation,
): boolean => {
  if (heldRelation === requiredRelation) return true;
  const hierarchy = relationHierarchy[objectType];
  if (!hierarchy) return false;
  const heldIdx = hierarchy.indexOf(heldRelation);
  const requiredIdx = hierarchy.indexOf(requiredRelation);
  if (heldIdx === -1 || requiredIdx === -1) return false;
  // 层级越前表示权限越高，持有前面的关系隐含持有后面的关系
  return heldIdx <= requiredIdx;
};
