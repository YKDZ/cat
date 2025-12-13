import {
  and,
  eq,
  isNull,
  like,
  or,
  permission,
  permissionTemplate,
  role,
  rolePermission,
  sql,
  userRole,
  type DrizzleClient,
} from "@cat/db";
import type { ResourceType } from "@cat/shared/schema/drizzle/enum";

type PermissionCheckInput = {
  resourceType: ResourceType;
  requiredPermission: string;
  resourceId?: string;
};

export const checkPermissions = async (
  drizzle: DrizzleClient,
  userId: string,
  permissions: PermissionCheckInput[],
): Promise<boolean[]> => {
  if (permissions.length === 0) return [];

  const permissionClauses = permissions.map((permissionToCheck) => {
    let clause = and(
      eq(permissionTemplate.resourceType, permissionToCheck.resourceType),
      or(
        eq(permissionTemplate.content, "*"),
        eq(permissionTemplate.content, permissionToCheck.requiredPermission),
        like(
          sql`replace(${permissionTemplate.content}, '*', '%')`,
          permissionToCheck.requiredPermission,
        ),
      ),
    );

    if (permissionToCheck.resourceId)
      clause = and(
        clause,
        or(
          eq(permission.resourceId, permissionToCheck.resourceId),
          isNull(permission.resourceId),
        ),
      );
    else clause = and(clause, isNull(permission.resourceId));

    return clause;
  });

  const combinedPermissionClause =
    permissionClauses.length === 1
      ? permissionClauses[0]
      : or(...permissionClauses);

  const matchedPermissions = await drizzle
    .select({
      resourceType: permissionTemplate.resourceType,
      templateContent: permissionTemplate.content,
      resourceId: permission.resourceId,
    })
    .from(userRole)
    .innerJoin(role, eq(userRole.roleId, role.id))
    .innerJoin(rolePermission, eq(role.id, rolePermission.roleId))
    .innerJoin(permission, eq(rolePermission.permissionId, permission.id))
    .innerJoin(
      permissionTemplate,
      eq(permission.templateId, permissionTemplate.id),
    )
    .where(and(eq(userRole.userId, userId), combinedPermissionClause));

  return permissions.map((permissionToCheck) =>
    matchedPermissions.some((matchedPermission) =>
      doesPermissionMatchRequest(matchedPermission, permissionToCheck),
    ),
  );
};

export const checkPermission = async (
  drizzle: DrizzleClient,
  userId: string,
  resourceType: ResourceType,
  requiredPermission: string,
  resourceId?: string,
): Promise<boolean> => {
  let whereClause = and(
    eq(userRole.userId, userId),
    eq(permissionTemplate.resourceType, resourceType),
    or(
      eq(permissionTemplate.content, "*"),
      eq(permissionTemplate.content, requiredPermission),
      like(
        sql`replace(${permissionTemplate.content}, '*', '%')`,
        requiredPermission,
      ),
    ),
  );

  if (resourceId)
    whereClause = and(
      whereClause,
      or(eq(permission.resourceId, resourceId), isNull(permission.resourceId)),
    );
  else whereClause = and(whereClause, isNull(permission.resourceId));

  const direct = await drizzle
    .select({ id: role.id })
    .from(userRole)
    .innerJoin(role, eq(userRole.roleId, role.id))
    .innerJoin(rolePermission, eq(role.id, rolePermission.roleId))
    .innerJoin(permission, eq(rolePermission.permissionId, permission.id))
    .innerJoin(
      permissionTemplate,
      eq(permission.templateId, permissionTemplate.id),
    )
    .where(whereClause)
    .limit(1);

  return direct.length === 1;
};

type MatchedPermission = {
  resourceType: ResourceType;
  templateContent: string;
  resourceId: string | null;
};

const doesPermissionMatchRequest = (
  matched: MatchedPermission,
  requested: PermissionCheckInput,
) => {
  if (matched.resourceType !== requested.resourceType) return false;

  if (requested.resourceId) {
    if (
      matched.resourceId !== requested.resourceId &&
      matched.resourceId !== null
    )
      return false;
  } else if (matched.resourceId !== null) return false;

  return doesTemplateMatchRequired(
    matched.templateContent,
    requested.requiredPermission,
  );
};

const doesTemplateMatchRequired = (template: string, required: string) => {
  if (template === "*" || template === required) return true;
  if (!template.includes("*")) return false;

  const regex = new RegExp(
    `^${template.split("*").map(escapeRegex).join(".*")}$`,
  );

  return regex.test(required);
};

const escapeRegex = (value: string) =>
  value.replace(/[-/\\^$+?.()|[\]{}]/g, "\\$&");
