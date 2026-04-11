import type { DiffStrategy } from "../diff-strategy.ts";

import { createGenericStrategy } from "./generic.ts";

/**
 * @zh project_settings 实体 diff 策略（CASCADING：影响全项目行为）
 * @en ProjectSettings entity diff strategy (CASCADING: affects whole project behavior)
 */
export const projectSettingsDiffStrategy: DiffStrategy = createGenericStrategy({
  entityType: "project_settings",
  semanticLabel: "Project Settings",
  impactScope: "CASCADING",
});

/**
 * @zh project_member 实体 diff 策略
 * @en ProjectMember entity diff strategy
 */
export const projectMemberDiffStrategy: DiffStrategy = createGenericStrategy({
  entityType: "project_member",
  semanticLabel: "Project Member",
  impactScope: "LOCAL",
  watchedFields: ["role", "permissions"],
});

/**
 * @zh project_attributes 实体 diff 策略
 * @en ProjectAttributes entity diff strategy
 */
export const projectAttributesDiffStrategy: DiffStrategy =
  createGenericStrategy({
    entityType: "project_attributes",
    semanticLabel: "Project Attributes",
    impactScope: "LOCAL",
  });

/**
 * @zh context 实体 diff 策略
 * @en Context entity diff strategy
 */
export const contextDiffStrategy: DiffStrategy = createGenericStrategy({
  entityType: "context",
  semanticLabel: "Context",
  impactScope: "LOCAL",
  watchedFields: ["content", "type", "scope"],
});
