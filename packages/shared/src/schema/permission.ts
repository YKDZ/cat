import * as z from "zod";

import {
  ObjectTypeSchema,
  PermissionActionSchema,
  RelationSchema,
  SubjectTypeSchema,
} from "./drizzle/enum.ts";

export {
  ObjectTypeSchema,
  PermissionActionSchema,
  RelationSchema,
  SubjectTypeSchema,
};
export type {
  ObjectType,
  PermissionAction,
  Relation,
  SubjectType,
} from "./drizzle/enum.ts";

export const PermissionCheckSchema = z.object({
  objectType: ObjectTypeSchema,
  objectId: z.string(),
  relation: RelationSchema,
});
export type PermissionCheck = z.infer<typeof PermissionCheckSchema>;

export const GrantPermissionSchema = z.object({
  subjectType: SubjectTypeSchema,
  subjectId: z.string(),
  relation: RelationSchema,
  objectType: ObjectTypeSchema,
  objectId: z.string(),
});
export type GrantPermission = z.infer<typeof GrantPermissionSchema>;
