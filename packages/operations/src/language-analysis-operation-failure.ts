import {
  LanguageAnalysisBlockerPolicy,
  LanguageAnalysisOperationFailureBlocker,
  type LanguageAnalysisBlockerReason,
  type OperationFailureInput,
  type TaskAffectedResource,
} from "@cat/shared";

import {
  LanguageAnalysisPolicyChangedError,
  LanguageAnalysisRequirementError,
} from "./language-analysis-requirement.ts";

type LanguageAnalysisFailureDefinition = Pick<
  OperationFailureInput,
  "code" | "message" | "severity" | "redactionBoundary"
>;

const failureDefinitions = {
  MISSING_SELECTION: {
    code: "CAT_OPERATION_MISSING_CAPABILITY",
    message: "Language analysis is not configured for this language.",
    severity: "ERROR",
    redactionBoundary: "PUBLIC",
  },
  MISSING_IMPLEMENTATION: {
    code: "CAT_OPERATION_MISSING_CAPABILITY",
    message: "The configured language analysis implementation is unavailable.",
    severity: "ERROR",
    redactionBoundary: "PUBLIC",
  },
  SERVICE_TYPE_MISMATCH: {
    code: "CAT_OPERATION_FAILED",
    message: "The language analysis implementation is misconfigured.",
    severity: "ERROR",
    redactionBoundary: "PUBLIC",
  },
  INSTALLATION_SCOPE_MISMATCH: {
    code: "CAT_OPERATION_FAILED",
    message: "The language analysis implementation is misconfigured.",
    severity: "ERROR",
    redactionBoundary: "PUBLIC",
  },
  DUPLICATE_IMPLEMENTATION: {
    code: "CAT_OPERATION_FAILED",
    message: "The language analysis implementation is misconfigured.",
    severity: "ERROR",
    redactionBoundary: "PUBLIC",
  },
  UNSUPPORTED_LANGUAGE: {
    code: "CAT_OPERATION_MISSING_CAPABILITY",
    message: "Language analysis is not available for this language.",
    severity: "ERROR",
    redactionBoundary: "PUBLIC",
  },
  INVALID_CONFIGURATION: {
    code: "CAT_OPERATION_FAILED",
    message: "The language analysis implementation is misconfigured.",
    severity: "ERROR",
    redactionBoundary: "PUBLIC",
  },
  UNAVAILABLE: {
    code: "CAT_OPERATION_DEPENDENCY_UNAVAILABLE",
    message: "Language analysis is temporarily unavailable.",
    severity: "ERROR",
    redactionBoundary: "PUBLIC",
  },
  TIMEOUT: {
    code: "CAT_OPERATION_DEPENDENCY_UNAVAILABLE",
    message: "Language analysis timed out.",
    severity: "ERROR",
    redactionBoundary: "PUBLIC",
  },
  INVALID_RESPONSE: {
    code: "CAT_OPERATION_FAILED",
    message: "Language analysis returned an invalid result.",
    severity: "ERROR",
    redactionBoundary: "PUBLIC",
  },
  INVALID_ATTESTATION: {
    code: "CAT_OPERATION_FAILED",
    message: "Language analysis returned an invalid result.",
    severity: "ERROR",
    redactionBoundary: "PUBLIC",
  },
} as const satisfies Record<
  LanguageAnalysisBlockerReason,
  LanguageAnalysisFailureDefinition
>;

const remediationHints = {
  CONFIGURE_SELECTION:
    "Configure language analysis for this language, then retry.",
  INSTALL_IMPLEMENTATION:
    "Install the configured language analysis implementation, then retry.",
  FIX_IMPLEMENTATION_TYPE:
    "Configure a language analysis implementation, then retry.",
  DECLARE_LANGUAGE_SUPPORT:
    "Configure language analysis that supports this language, then retry.",
  FIX_CONFIGURATION: "Correct the language analysis configuration, then retry.",
  RETRY_LATER: "Retry after the language analysis service is available.",
  FIX_ANALYZER_RESPONSE:
    "Correct the language analysis implementation response, then retry.",
} as const;

const policyChangedFailure: OperationFailureInput = {
  code: "CAT_OPERATION_DEPENDENCY_UNAVAILABLE",
  message: "Language analysis configuration changed during the operation.",
  severity: "ERROR",
  retryable: true,
  blocker: "language_analysis_policy_changed",
  capability: "LANGUAGE_ANALYSIS",
  affectedResources: [],
  remediationHint: "Retry after the language analysis configuration is stable.",
  redactionBoundary: "PUBLIC",
};

const toRequirementFailure = (
  reason: LanguageAnalysisBlockerReason,
  affectedResources: TaskAffectedResource[],
): OperationFailureInput => {
  const definition = failureDefinitions[reason];
  const policy = LanguageAnalysisBlockerPolicy[reason];
  return {
    ...definition,
    retryable: policy.retryable,
    blocker: LanguageAnalysisOperationFailureBlocker[reason],
    capability: "LANGUAGE_ANALYSIS",
    affectedResources,
    remediationHint: remediationHints[policy.remediation],
  };
};

/** Maps known language-analysis failures without persisting them. */
export const mapLanguageAnalysisOperationFailure = (
  error: unknown,
  affectedResources: TaskAffectedResource[],
): OperationFailureInput | undefined => {
  if (error instanceof LanguageAnalysisPolicyChangedError) {
    return { ...policyChangedFailure, affectedResources };
  }
  if (!(error instanceof LanguageAnalysisRequirementError)) return undefined;

  const reason = error.assessment.blocker?.reason;
  return reason === undefined
    ? undefined
    : toRequirementFailure(reason, affectedResources);
};

export class LanguageAnalysisOperationFailureError extends Error {
  public readonly failure: OperationFailureInput;
  /** Scheduler-facing alias that keeps the failure serializable in run events. */
  public readonly operationFailure: OperationFailureInput;

  public constructor(failure: OperationFailureInput, options?: ErrorOptions) {
    super(failure.message, options);
    this.name = "LanguageAnalysisOperationFailureError";
    this.failure = failure;
    this.operationFailure = failure;
  }
}
