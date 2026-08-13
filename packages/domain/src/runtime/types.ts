import * as z from "zod";

import type { DatabaseRequirementAssessment } from "./database-requirements.ts";

/**
 * Zod schema for runtime profile names.
 */
export const RuntimeProfileNameSchema = z.enum([
  "lite",
  "standard",
  "production",
]);

/**
 * Runtime profile name.
 */
export type RuntimeProfileName = z.infer<typeof RuntimeProfileNameSchema>;

/**
 * Zod schema for runtime backend kinds.
 */
export const RuntimeBackendSchema = z.enum(["memory", "postgres", "redis"]);

/**
 * Runtime backend kind.
 */
export type RuntimeBackend = z.infer<typeof RuntimeBackendSchema>;

/**
 * Summary of a single runtime storage policy.
 */
export type RuntimeStorePolicy = {
  /**
   * Storage backend kind.
   */
  backend: RuntimeBackend;
  /**
   * Whether this backend persists data.
   */
  persistent: boolean;
  /**
   * Whether this backend is shared across processes.
   */
  sharedAcrossProcesses: boolean;
};

/**
 * Resolved runtime profile configuration.
 */
export type RuntimeProfile = {
  /**
   * Profile name.
   */
  name: RuntimeProfileName;
  /**
   * Cache backend policy.
   */
  cache: RuntimeStorePolicy;
  /**
   * Session backend policy.
   */
  session: RuntimeStorePolicy;
  /**
   * Queue backend policy.
   */
  queue: RuntimeStorePolicy;
  /**
   * Whether non-persistent backends are allowed.
   */
  allowNonPersistentBackends: boolean;
  /**
   * Whether the current profile requires Redis.
   */
  requireRedis: boolean;
  /**
   * Whether external services may register by default and degrade by availability.
   */
  externalServicesOptional: boolean;
  /**
   * Runtime warning messages.
   */
  warnings: string[];
};

/**
 * Process-wide shared runtime state snapshot.
 */
export type RuntimeState = {
  /**
   * Currently resolved runtime profile.
   */
  profile: RuntimeProfile;
  /** Current database requirement assessment. */
  database: DatabaseRequirementAssessment;
  /**
   * Timestamp when runtime state was initialized.
   */
  initializedAt: string;
};
