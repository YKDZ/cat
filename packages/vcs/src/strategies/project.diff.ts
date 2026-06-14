import type { DiffStrategy } from "../diff-strategy.ts";

import { createGenericStrategy } from "./generic.ts";

/**
 * ProjectSettings entity diff strategy (CASCADING: affects whole project behavior)
 */
export const projectSettingsDiffStrategy: DiffStrategy = createGenericStrategy({
  entityType: "project_settings",
  semanticLabel: "Project Settings",
  impactScope: "CASCADING",
});

/**
 * ProjectMember entity diff strategy
 */
export const projectMemberDiffStrategy: DiffStrategy = createGenericStrategy({
  entityType: "project_member",
  semanticLabel: "Project Member",
  impactScope: "LOCAL",
  watchedFields: ["role", "permissions"],
});

/**
 * ProjectAttributes entity diff strategy
 */
export const projectAttributesDiffStrategy: DiffStrategy =
  createGenericStrategy({
    entityType: "project_attributes",
    semanticLabel: "Project Attributes",
    impactScope: "LOCAL",
  });

/**
 * Context entity diff strategy
 */
export const contextDiffStrategy: DiffStrategy = createGenericStrategy({
  entityType: "context",
  semanticLabel: "Context",
  impactScope: "LOCAL",
  watchedFields: ["content", "type", "scope"],
});
