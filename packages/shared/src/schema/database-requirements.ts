import * as z from "zod";

import { DatabaseRequirementIdValues } from "#/schema/enum.ts";

export const DatabaseRequirementBlockerReasonValues = [
  "EXTENSION_MISSING",
  "MISSING_CAPABILITY",
  "REQUIRED_BEHAVIOUR_MISSING",
  "REQUIRED_SCHEMA_INVALID",
  "CONNECTION_UNAVAILABLE",
  "PERMISSION_DENIED",
  "QUERY_TIMEOUT",
  "PROBE_UNCLASSIFIED",
] as const;

export const DatabaseRequirementBlockerReasonSchema = z.enum(
  DatabaseRequirementBlockerReasonValues,
);
export type DatabaseRequirementBlockerReason = z.infer<
  typeof DatabaseRequirementBlockerReasonSchema
>;

export const DatabaseRequirementBlockedReasonSchema = z.enum([
  "EXTENSION_MISSING",
  "MISSING_CAPABILITY",
  "REQUIRED_BEHAVIOUR_MISSING",
  "REQUIRED_SCHEMA_INVALID",
]);
export type DatabaseRequirementBlockedReason = z.infer<
  typeof DatabaseRequirementBlockedReasonSchema
>;

export const DatabaseRequirementUnknownReasonSchema = z.enum([
  "CONNECTION_UNAVAILABLE",
  "PERMISSION_DENIED",
  "QUERY_TIMEOUT",
  "PROBE_UNCLASSIFIED",
]);
export type DatabaseRequirementUnknownReason = z.infer<
  typeof DatabaseRequirementUnknownReasonSchema
>;

const databaseRequirementSchema = <
  const TId extends (typeof DatabaseRequirementIdValues)[number],
>(
  id: TId,
) =>
  z.discriminatedUnion("status", [
    z.strictObject({ id: z.literal(id), status: z.literal("SATISFIED") }),
    z.strictObject({
      blocker: z.strictObject({
        reason: DatabaseRequirementBlockedReasonSchema,
      }),
      id: z.literal(id),
      status: z.literal("BLOCKED"),
    }),
    z.strictObject({
      blocker: z.strictObject({
        reason: DatabaseRequirementUnknownReasonSchema,
      }),
      id: z.literal(id),
      status: z.literal("UNKNOWN"),
    }),
  ]);

export const DatabaseRequirementSchema = z.discriminatedUnion("id", [
  databaseRequirementSchema("POSTGRESQL_CORE"),
  databaseRequirementSchema("POSTGRESQL_TRIGRAM_MATCHING"),
  databaseRequirementSchema("POSTGRESQL_VECTOR_STORAGE"),
]);
export type DatabaseRequirement = z.infer<typeof DatabaseRequirementSchema>;

export const DatabaseRequirementSetSchema = z.tuple([
  databaseRequirementSchema("POSTGRESQL_CORE"),
  databaseRequirementSchema("POSTGRESQL_TRIGRAM_MATCHING"),
  databaseRequirementSchema("POSTGRESQL_VECTOR_STORAGE"),
]);
export type DatabaseRequirementSet = z.infer<
  typeof DatabaseRequirementSetSchema
>;

/** The public assessment always contains CAT's three requirements once, in this order. */
export const DatabaseRequirementAssessmentSchema = z.strictObject({
  requirements: DatabaseRequirementSetSchema,
});
export type DatabaseRequirementAssessment = z.infer<
  typeof DatabaseRequirementAssessmentSchema
>;

export const DatabaseReadinessCodeValues = [
  "DATABASE_POSTGRESQL_CORE_BLOCKED",
  "DATABASE_POSTGRESQL_CORE_UNKNOWN",
  "DATABASE_POSTGRESQL_TRIGRAM_MATCHING_BLOCKED",
  "DATABASE_POSTGRESQL_TRIGRAM_MATCHING_UNKNOWN",
  "DATABASE_POSTGRESQL_VECTOR_STORAGE_BLOCKED",
  "DATABASE_POSTGRESQL_VECTOR_STORAGE_UNKNOWN",
] as const;
export const DatabaseReadinessCodeSchema = z.enum(DatabaseReadinessCodeValues);
export type DatabaseReadinessCode = z.infer<typeof DatabaseReadinessCodeSchema>;

export const databaseReadinessCode = (
  requirement: Exclude<DatabaseRequirement, { status: "SATISFIED" }>,
): DatabaseReadinessCode =>
  DatabaseReadinessCodeSchema.parse(
    `DATABASE_${requirement.id}_${requirement.status}`,
  );
