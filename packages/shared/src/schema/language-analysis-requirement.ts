import * as z from "zod";

import type { OperationFailureBlocker } from "#/schema/enum.ts";
import {
  NormalizedLanguageIdSchema,
  type NormalizedLanguageId,
} from "#/schema/language-analysis.ts";
import { ServiceImplementationReferenceSchema } from "#/schema/service-implementation-reference.ts";

declare const languageAnalysisSelectionKey: unique symbol;
declare const languageAnalysisSelectionFingerprint: unique symbol;
declare const languageAnalysisPolicySnapshot: unique symbol;

export type LanguageAnalysisSelectionKey = string & {
  readonly [languageAnalysisSelectionKey]: "LanguageAnalysisSelectionKey";
};

export type LanguageAnalysisSelectionFingerprint = string & {
  readonly [languageAnalysisSelectionFingerprint]: "LanguageAnalysisSelectionFingerprint";
};

export type LanguageAnalysisPolicySnapshot = {
  readonly policyEpoch: number;
  readonly [languageAnalysisPolicySnapshot]: "LanguageAnalysisPolicySnapshot";
};

export const LanguageAnalysisPolicySnapshotSchema = z
  .strictObject({ policyEpoch: z.int().nonnegative() })
  .transform(
    (value): LanguageAnalysisPolicySnapshot =>
      value as LanguageAnalysisPolicySnapshot,
  );

export const LanguageAnalysisSelectionKeySchema = z
  .union([z.literal("*"), NormalizedLanguageIdSchema])
  .transform(
    (value): LanguageAnalysisSelectionKey =>
      value as LanguageAnalysisSelectionKey,
  );

/** The only deployment-wide fallback slot; no raw wildcard is accepted elsewhere. */
export const LanguageAnalysisWildcardSelectionKey =
  LanguageAnalysisSelectionKeySchema.parse("*");

export const toLanguageAnalysisSelectionKey = (
  value: NormalizedLanguageId,
): LanguageAnalysisSelectionKey =>
  LanguageAnalysisSelectionKeySchema.parse(value);

export const LanguageAnalysisSelectionFingerprintSchema = z
  .string()
  .regex(/^sha256:[a-f0-9]{64}$/)
  .transform(
    (value): LanguageAnalysisSelectionFingerprint =>
      value as LanguageAnalysisSelectionFingerprint,
  );

export const LanguageAnalysisBlockerReasonValues = [
  "MISSING_SELECTION",
  "MISSING_IMPLEMENTATION",
  "SERVICE_TYPE_MISMATCH",
  "INSTALLATION_SCOPE_MISMATCH",
  "DUPLICATE_IMPLEMENTATION",
  "UNSUPPORTED_LANGUAGE",
  "INVALID_CONFIGURATION",
  "UNAVAILABLE",
  "TIMEOUT",
  "INVALID_RESPONSE",
  "INVALID_ATTESTATION",
] as const;
export const LanguageAnalysisBlockerReasonSchema = z.enum(
  LanguageAnalysisBlockerReasonValues,
);
export type LanguageAnalysisBlockerReason = z.infer<
  typeof LanguageAnalysisBlockerReasonSchema
>;

/** Stable cross-boundary failure identity for each language analysis blocker. */
export const LanguageAnalysisOperationFailureBlocker = {
  MISSING_SELECTION: "language_analysis_missing_selection",
  MISSING_IMPLEMENTATION: "language_analysis_missing_implementation",
  SERVICE_TYPE_MISMATCH: "language_analysis_service_type_mismatch",
  INSTALLATION_SCOPE_MISMATCH: "language_analysis_installation_scope_mismatch",
  DUPLICATE_IMPLEMENTATION: "language_analysis_duplicate_implementation",
  UNSUPPORTED_LANGUAGE: "language_analysis_unsupported_language",
  INVALID_CONFIGURATION: "language_analysis_invalid_configuration",
  UNAVAILABLE: "language_analysis_unavailable",
  TIMEOUT: "language_analysis_timeout",
  INVALID_RESPONSE: "language_analysis_invalid_response",
  INVALID_ATTESTATION: "language_analysis_invalid_attestation",
} as const satisfies Record<
  LanguageAnalysisBlockerReason,
  OperationFailureBlocker
>;

export const LanguageAnalysisBlockerPolicy = {
  MISSING_SELECTION: { retryable: false, remediation: "CONFIGURE_SELECTION" },
  MISSING_IMPLEMENTATION: {
    retryable: false,
    remediation: "INSTALL_IMPLEMENTATION",
  },
  SERVICE_TYPE_MISMATCH: {
    retryable: false,
    remediation: "FIX_IMPLEMENTATION_TYPE",
  },
  INSTALLATION_SCOPE_MISMATCH: {
    retryable: false,
    remediation: "FIX_CONFIGURATION",
  },
  DUPLICATE_IMPLEMENTATION: {
    retryable: false,
    remediation: "FIX_CONFIGURATION",
  },
  UNSUPPORTED_LANGUAGE: {
    retryable: false,
    remediation: "DECLARE_LANGUAGE_SUPPORT",
  },
  INVALID_CONFIGURATION: { retryable: false, remediation: "FIX_CONFIGURATION" },
  UNAVAILABLE: { retryable: true, remediation: "RETRY_LATER" },
  TIMEOUT: { retryable: true, remediation: "RETRY_LATER" },
  INVALID_RESPONSE: { retryable: false, remediation: "FIX_ANALYZER_RESPONSE" },
  INVALID_ATTESTATION: {
    retryable: false,
    remediation: "FIX_ANALYZER_RESPONSE",
  },
} as const;

export const LanguageAnalysisRequirementStatusValues = [
  "SATISFIED",
  "BLOCKED",
  "UNKNOWN",
] as const;
export const LanguageAnalysisRequirementStatusSchema = z.enum(
  LanguageAnalysisRequirementStatusValues,
);
export type LanguageAnalysisRequirementStatus = z.infer<
  typeof LanguageAnalysisRequirementStatusSchema
>;

export const LanguageAnalysisSelectionSchema = z
  .strictObject({
    key: LanguageAnalysisSelectionKeySchema,
    implementation: ServiceImplementationReferenceSchema.nullable(),
    revision: z.int().nonnegative(),
    configurationFingerprint:
      LanguageAnalysisSelectionFingerprintSchema.nullable(),
    updatedAt: z.coerce.date(),
  })
  .superRefine((value, ctx) => {
    if (
      (value.implementation === null) !==
      (value.configurationFingerprint === null)
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "Language Analysis selection fingerprints exist exactly for an implementation.",
      });
    }
  });
export type LanguageAnalysisSelection = z.infer<
  typeof LanguageAnalysisSelectionSchema
>;

export const LanguageAnalysisSelectionWriteSchema = z.strictObject({
  key: LanguageAnalysisSelectionKeySchema,
  expectedRevision: z.int().nonnegative(),
  implementation: ServiceImplementationReferenceSchema.nullable(),
});
export type LanguageAnalysisSelectionWrite = z.infer<
  typeof LanguageAnalysisSelectionWriteSchema
>;

export const LanguageAnalysisRemediationSchema = z.enum([
  "CONFIGURE_SELECTION",
  "INSTALL_IMPLEMENTATION",
  "FIX_IMPLEMENTATION_TYPE",
  "DECLARE_LANGUAGE_SUPPORT",
  "FIX_CONFIGURATION",
  "RETRY_LATER",
  "FIX_ANALYZER_RESPONSE",
]);
export type LanguageAnalysisRemediation = z.infer<
  typeof LanguageAnalysisRemediationSchema
>;

export const LanguageAnalysisBlockerSchema = z
  .strictObject({
    reason: LanguageAnalysisBlockerReasonSchema,
    retryable: z.boolean(),
    languageId: NormalizedLanguageIdSchema,
    implementation: ServiceImplementationReferenceSchema.nullable(),
    observedAt: z.coerce.date(),
    remediation: LanguageAnalysisRemediationSchema,
  })
  .superRefine((value, ctx) => {
    const policy = LanguageAnalysisBlockerPolicy[value.reason];
    if (
      policy.retryable !== value.retryable ||
      policy.remediation !== value.remediation
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Language Analysis blocker policy must match its reason.",
      });
    }
  });
export type LanguageAnalysisBlocker = z.infer<
  typeof LanguageAnalysisBlockerSchema
>;

export const LanguageAnalysisRequirementAssessmentSchema = z
  .strictObject({
    status: LanguageAnalysisRequirementStatusSchema,
    languageId: NormalizedLanguageIdSchema,
    policyEpoch: z.int().nonnegative(),
    selection: LanguageAnalysisSelectionSchema.nullable(),
    blocker: LanguageAnalysisBlockerSchema.nullable(),
    assessedAt: z.coerce.date(),
  })
  .superRefine((value, ctx) => {
    if (
      value.status === "BLOCKED"
        ? value.blocker === null
        : value.blocker !== null
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "Language Analysis blockers are present exactly for blocked assessments.",
      });
    }
    if (value.status === "SATISFIED" && value.selection === null) {
      ctx.addIssue({
        code: "custom",
        message: "Satisfied Language Analysis assessments require a selection.",
      });
    }
    if (
      value.status === "SATISFIED" &&
      value.selection?.implementation === null
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "Satisfied Language Analysis assessments require an implementation.",
      });
    }
  });
export type LanguageAnalysisRequirementAssessment = z.infer<
  typeof LanguageAnalysisRequirementAssessmentSchema
>;

export const LanguageAnalysisObservationSchema = z
  .strictObject({
    languageId: NormalizedLanguageIdSchema,
    policyEpoch: z.int().nonnegative(),
    selectionKey: LanguageAnalysisSelectionKeySchema,
    selectionRevision: z.int().nonnegative(),
    configurationFingerprint: LanguageAnalysisSelectionFingerprintSchema,
    assessment: LanguageAnalysisRequirementAssessmentSchema,
    observedAt: z.coerce.date(),
  })
  .superRefine((value, ctx) => {
    const selected = value.assessment.selection;
    if (
      value.assessment.languageId !== value.languageId ||
      value.assessment.policyEpoch !== value.policyEpoch ||
      selected?.key !== value.selectionKey ||
      selected?.revision !== value.selectionRevision ||
      selected?.configurationFingerprint !== value.configurationFingerprint
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "Language Analysis observations must match their assessment policy snapshot.",
      });
    }
  });
export type LanguageAnalysisObservation = z.infer<
  typeof LanguageAnalysisObservationSchema
>;

export const LanguageAnalysisSelectionSourceSchema = z.enum([
  "EXACT",
  "WILDCARD",
  "NONE",
]);
export type LanguageAnalysisSelectionSource = z.infer<
  typeof LanguageAnalysisSelectionSourceSchema
>;

export const LanguageAnalysisObservationViewSchema = z.strictObject({
  languageId: NormalizedLanguageIdSchema,
  source: LanguageAnalysisSelectionSourceSchema,
  selection: LanguageAnalysisSelectionSchema.nullable(),
  tombstone: LanguageAnalysisSelectionSchema.nullable(),
  observation: LanguageAnalysisObservationSchema.nullable(),
  assessment: LanguageAnalysisRequirementAssessmentSchema,
});
export type LanguageAnalysisObservationView = z.infer<
  typeof LanguageAnalysisObservationViewSchema
>;
