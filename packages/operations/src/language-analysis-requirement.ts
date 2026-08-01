import { createHash } from "node:crypto";

import {
  executeCommand,
  executeQuery,
  getLanguageAnalysisPolicyEpoch,
  getDbHandle,
  listLanguageAnalysisSelections,
  resolveLanguageAnalysisSelection,
  StaleLanguageAnalysisObservationError,
  writeLanguageAnalysisObservation,
  type DbContext,
  type OperationContext,
} from "@cat/domain";
import {
  PluginServiceUnavailableError,
  type LanguageAnalyzer,
} from "@cat/plugin-core";
import {
  ServiceImplementationResolutionError,
  resolvePluginManager,
  resolveServiceImplementation,
} from "@cat/server-shared";
import {
  LanguageAnalysisBlockerPolicy,
  LanguageAnalyzerConfigurationAssessmentSchema,
  LanguageAnalysisValidationError,
  LanguageAnalysisRequirementAssessmentSchema,
  LanguageAnalysisSelectionFingerprintSchema,
  LanguageAnalysisWildcardSelectionKey,
  NormalizedLanguageIdSchema,
  serviceImplementationReferenceKey,
  stableSerializeLanguageAnalysis,
  type LanguageAnalysisBlocker,
  type LanguageAnalysisBlockerReason,
  type LanguageAnalysisObservation,
  type LanguageAnalysisRequirementAssessment,
  type LanguageAnalysisSelection,
  type JSONType,
  type NormalizedLanguageId,
  type ServiceImplementationReference,
} from "@cat/shared";
import * as z from "zod";

import {
  executeLanguageAnalysis,
  executeLanguageAnalysisBatch,
  type HostValidatedLanguageAnalysisResult,
  type HostValidatedLanguageAnalysisBatchResult,
} from "./language-analysis-execution.ts";

const RequirementInputSchema = z.strictObject({
  languageId: NormalizedLanguageIdSchema,
  timeoutMs: z.int().positive().optional(),
});

const makeBlocker = (
  languageId: NormalizedLanguageId,
  reason: LanguageAnalysisBlockerReason,
  implementation: ServiceImplementationReference | null,
): LanguageAnalysisBlocker => ({
  ...LanguageAnalysisBlockerPolicy[reason],
  reason,
  languageId,
  implementation,
  observedAt: new Date(),
});

const blocked = (
  languageId: NormalizedLanguageId,
  policyEpoch: number,
  selection: LanguageAnalysisSelection | null,
  reason: LanguageAnalysisBlockerReason,
  implementation: ServiceImplementationReference | null,
): LanguageAnalysisRequirementAssessment => {
  const value = makeBlocker(languageId, reason, implementation);
  return LanguageAnalysisRequirementAssessmentSchema.parse({
    status: "BLOCKED",
    languageId,
    policyEpoch,
    selection,
    blocker: value,
    assessedAt: value.observedAt,
  });
};

export const computeLanguageAnalysisConfigurationFingerprint = (
  reference: ServiceImplementationReference,
  packageName: string,
  packageVersion: string,
  supportedLanguages: readonly NormalizedLanguageId[],
  semanticConfiguration: Readonly<Record<string, JSONType>>,
) =>
  LanguageAnalysisSelectionFingerprintSchema.parse(
    `sha256:${createHash("sha256")
      .update(
        stableSerializeLanguageAnalysis({
          packageName,
          packageVersion,
          reference,
          supportedLanguages: [...supportedLanguages].sort(),
          semanticConfiguration,
        }),
      )
      .digest("hex")}`,
  );

type ValidatedConfiguration = {
  analyzer: LanguageAnalyzer;
  fingerprint: ReturnType<
    typeof computeLanguageAnalysisConfigurationFingerprint
  >;
  supportedLanguages: NormalizedLanguageId[];
};

/** Validate identity and declared language support without running an analysis. */
export const validateLanguageAnalyzerConfiguration = async (
  reference: ServiceImplementationReference,
  ctx?: OperationContext,
): Promise<ValidatedConfiguration> => {
  if (reference.scopeType !== "GLOBAL" || reference.scopeId !== "") {
    throw new LanguageAnalysisInstallationScopeError();
  }
  const pluginManager = resolvePluginManager(ctx?.pluginManager);
  const analyzer = resolveServiceImplementation(
    pluginManager,
    reference,
    "LANGUAGE_ANALYZER",
  );
  let assessment;
  try {
    assessment = LanguageAnalyzerConfigurationAssessmentSchema.parse(
      analyzer.getLanguageAnalysisConfigurationAssessment(),
    );
  } catch {
    throw new InvalidLanguageAnalysisConfigurationError();
  }
  if (assessment.status === "INVALID") {
    throw new InvalidLanguageAnalysisConfigurationError();
  }
  const supportedLanguages = assessment.supportedLanguages;
  const packageData = await pluginManager
    .getLoader()
    .getData(reference.pluginId);
  return {
    analyzer,
    supportedLanguages,
    fingerprint: computeLanguageAnalysisConfigurationFingerprint(
      reference,
      packageData.name,
      packageData.version,
      supportedLanguages,
      assessment.semanticConfiguration,
    ),
  };
};

/**
 * Configuration-only assessment. It intentionally does not call `analyze` and
 * is therefore suitable before a project or source transaction starts.
 */
export const assessLanguageAnalysisConfiguration = async (
  input: z.input<typeof RequirementInputSchema>,
  ctx?: OperationContext,
): Promise<LanguageAnalysisRequirementAssessment> => {
  const { languageId } = RequirementInputSchema.parse({
    languageId: input.languageId,
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
  });
  const { client } = await getDbHandle();
  const resolved = await executeQuery(
    { db: client },
    resolveLanguageAnalysisSelection,
    { languageId },
  );
  const selection = resolved.selection;
  if (selection?.implementation === null || selection === null) {
    return blocked(
      languageId,
      resolved.policyEpoch,
      selection,
      "MISSING_SELECTION",
      null,
    );
  }

  const reference = selection.implementation;
  let configuration: ValidatedConfiguration;
  try {
    configuration = await validateLanguageAnalyzerConfiguration(reference, ctx);
  } catch (error) {
    rethrowCancellation(error, ctx?.signal);
    if (error instanceof ServiceImplementationResolutionError) {
      const reason =
        error.resolution.kind === "MISSING_IMPLEMENTATION" ||
        error.resolution.kind === "PACKAGE_NOT_LOADED"
          ? "MISSING_IMPLEMENTATION"
          : error.resolution.kind;
      return blocked(
        languageId,
        resolved.policyEpoch,
        selection,
        reason,
        reference,
      );
    }
    if (error instanceof LanguageAnalysisInstallationScopeError) {
      return blocked(
        languageId,
        resolved.policyEpoch,
        selection,
        "INSTALLATION_SCOPE_MISMATCH",
        reference,
      );
    }
    if (error instanceof InvalidLanguageAnalysisConfigurationError) {
      return blocked(
        languageId,
        resolved.policyEpoch,
        selection,
        "INVALID_CONFIGURATION",
        reference,
      );
    }
    if (error instanceof PluginServiceUnavailableError) {
      return blocked(
        languageId,
        resolved.policyEpoch,
        selection,
        "UNAVAILABLE",
        reference,
      );
    }
    throw error;
  }
  if (!configuration.supportedLanguages.includes(languageId)) {
    return blocked(
      languageId,
      resolved.policyEpoch,
      selection,
      "UNSUPPORTED_LANGUAGE",
      reference,
    );
  }
  if (configuration.fingerprint !== selection.configurationFingerprint) {
    return blocked(
      languageId,
      resolved.policyEpoch,
      selection,
      "INVALID_CONFIGURATION",
      reference,
    );
  }
  return LanguageAnalysisRequirementAssessmentSchema.parse({
    status: "SATISFIED",
    languageId,
    policyEpoch: resolved.policyEpoch,
    selection,
    blocker: null,
    assessedAt: new Date(),
  });
};

const persistObservation = async (
  assessment: LanguageAnalysisRequirementAssessment,
): Promise<void> => {
  if (
    assessment.selection === null ||
    assessment.selection.implementation === null ||
    assessment.selection.configurationFingerprint === null
  ) {
    return;
  }
  const { client } = await getDbHandle();
  const observation: LanguageAnalysisObservation = {
    languageId: assessment.languageId,
    policyEpoch: assessment.policyEpoch,
    selectionKey: assessment.selection.key,
    selectionRevision: assessment.selection.revision,
    configurationFingerprint: assessment.selection.configurationFingerprint,
    assessment,
    observedAt: assessment.assessedAt,
  };
  await executeCommand(
    { db: client },
    writeLanguageAnalysisObservation,
    observation,
  );
};

const executionFailureReason = (
  error: unknown,
): LanguageAnalysisBlockerReason | undefined => {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return "TIMEOUT";
  }
  if (error instanceof LanguageAnalysisValidationError) return error.code;
  if (error instanceof PluginServiceUnavailableError) return "UNAVAILABLE";
  return undefined;
};

const rethrowCancellation = (
  error: unknown,
  signal: AbortSignal | undefined,
): void => {
  if (signal?.aborted) throw signal.reason ?? error;
};

const rejectStaleObservation = async (
  error: unknown,
  input: z.input<typeof RequirementInputSchema>,
  ctx?: OperationContext,
): Promise<never> => {
  rethrowCancellation(error, ctx?.signal);
  if (!(error instanceof StaleLanguageAnalysisObservationError)) throw error;
  // A result is only valid for the policy snapshot that selected it. Re-read
  // once for diagnosis, then expose a distinct concurrency failure rather than
  // fabricating a SATISFIED requirement assessment for a newer policy.
  await assessLanguageAnalysisConfiguration(input, ctx);
  throw new LanguageAnalysisPolicyChangedError(error);
};

/** Execution gate that always re-evaluates policy and refreshes its observation. */
export const executeRequiredLanguageAnalysis = async (
  input: z.input<typeof RequirementInputSchema> & { text: string },
  ctx?: OperationContext,
): Promise<HostValidatedLanguageAnalysisResult> => {
  const parsed = RequirementInputSchema.extend({ text: z.string() }).parse(
    input,
  );
  const assessment = await assessLanguageAnalysisConfiguration(parsed, ctx);
  const implementation = assessment.selection?.implementation;
  if (
    assessment.status !== "SATISFIED" ||
    implementation === null ||
    implementation === undefined
  ) {
    await persistObservation(assessment);
    throw new LanguageAnalysisRequirementError(assessment);
  }
  let result: HostValidatedLanguageAnalysisResult;
  try {
    result = await executeLanguageAnalysis(
      {
        languageAnalyzer: implementation,
        languageId: parsed.languageId,
        text: parsed.text,
        ...(parsed.timeoutMs === undefined
          ? {}
          : { timeoutMs: parsed.timeoutMs }),
      },
      ctx,
    );
  } catch (error) {
    rethrowCancellation(error, ctx?.signal);
    const reason = executionFailureReason(error);
    if (reason === undefined) throw error;
    const failed = blocked(
      parsed.languageId,
      assessment.policyEpoch,
      assessment.selection,
      reason,
      implementation,
    );
    await persistObservation(failed);
    throw new LanguageAnalysisRequirementError(failed, error);
  }
  try {
    await persistObservation(
      LanguageAnalysisRequirementAssessmentSchema.parse({
        ...assessment,
        assessedAt: new Date(),
      }),
    );
  } catch (error) {
    return await rejectStaleObservation(error, parsed, ctx);
  }
  return result;
};

export const executeRequiredLanguageAnalysisBatch = async (
  input: z.input<typeof RequirementInputSchema> & {
    items: Array<{ id: string; text: string }>;
  },
  ctx?: OperationContext,
): Promise<HostValidatedLanguageAnalysisBatchResult> => {
  const parsed = RequirementInputSchema.extend({
    items: z.array(z.strictObject({ id: z.string(), text: z.string() })).min(1),
  }).parse(input);
  const assessment = await assessLanguageAnalysisConfiguration(parsed, ctx);
  const implementation = assessment.selection?.implementation;
  if (
    assessment.status !== "SATISFIED" ||
    implementation === null ||
    implementation === undefined
  ) {
    await persistObservation(assessment);
    throw new LanguageAnalysisRequirementError(assessment);
  }
  let result: HostValidatedLanguageAnalysisBatchResult;
  try {
    result = await executeLanguageAnalysisBatch(
      {
        languageAnalyzer: implementation,
        languageId: parsed.languageId,
        items: parsed.items,
        ...(parsed.timeoutMs === undefined
          ? {}
          : { timeoutMs: parsed.timeoutMs }),
      },
      ctx,
    );
  } catch (error) {
    rethrowCancellation(error, ctx?.signal);
    const reason = executionFailureReason(error);
    if (reason === undefined) throw error;
    const failed = blocked(
      parsed.languageId,
      assessment.policyEpoch,
      assessment.selection,
      reason,
      implementation,
    );
    await persistObservation(failed);
    throw new LanguageAnalysisRequirementError(failed, error);
  }
  try {
    await persistObservation(
      LanguageAnalysisRequirementAssessmentSchema.parse({
        ...assessment,
        assessedAt: new Date(),
      }),
    );
  } catch (error) {
    return await rejectStaleObservation(error, parsed, ctx);
  }
  return result;
};

export class LanguageAnalysisRequirementError extends Error {
  public readonly assessment: LanguageAnalysisRequirementAssessment;

  public constructor(
    assessment: LanguageAnalysisRequirementAssessment,
    cause?: unknown,
  ) {
    super(`Language Analysis requirement is ${assessment.status}.`, { cause });
    this.name = "LanguageAnalysisRequirementError";
    this.assessment = assessment;
  }
}

export class LanguageAnalysisPolicyChangedError extends Error {
  public constructor(cause: unknown) {
    super(
      "Language Analysis selection changed while the operation was executing.",
      { cause },
    );
    this.name = "LanguageAnalysisPolicyChangedError";
  }
}

export class LanguageAnalysisReadinessError extends Error {
  public readonly reason: LanguageAnalysisBlockerReason;

  public constructor(
    reason: LanguageAnalysisBlockerReason,
    options?: ErrorOptions,
  ) {
    super(`Language Analysis readiness is blocked by ${reason}.`, options);
    this.name = "LanguageAnalysisReadinessError";
    this.reason = reason;
  }
}

const readinessConfigurationFailureReason = (
  error: unknown,
): LanguageAnalysisBlockerReason | undefined => {
  if (error instanceof ServiceImplementationResolutionError) {
    return error.resolution.kind === "PACKAGE_NOT_LOADED"
      ? "MISSING_IMPLEMENTATION"
      : error.resolution.kind;
  }
  if (error instanceof LanguageAnalysisInstallationScopeError) {
    return "INSTALLATION_SCOPE_MISMATCH";
  }
  if (error instanceof InvalidLanguageAnalysisConfigurationError) {
    return "INVALID_CONFIGURATION";
  }
  if (error instanceof PluginServiceUnavailableError) return "UNAVAILABLE";
  return undefined;
};

const MAX_READINESS_LIVE_PROBES = 128;

const readStableLanguageAnalysisSelections = async (
  db: DbContext,
): Promise<LanguageAnalysisSelection[]> => {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    // oxlint-disable-next-line no-await-in-loop
    const epochBefore = await executeQuery(
      db,
      getLanguageAnalysisPolicyEpoch,
      {},
    );
    // oxlint-disable-next-line no-await-in-loop
    const selections = await executeQuery(
      db,
      listLanguageAnalysisSelections,
      {},
    );
    // oxlint-disable-next-line no-await-in-loop
    const epochAfter = await executeQuery(
      db,
      getLanguageAnalysisPolicyEpoch,
      {},
    );
    if (epochBefore === epochAfter) return selections;
  }
  throw new LanguageAnalysisReadinessError("UNAVAILABLE", {
    cause: new Error(
      "Language Analysis policy changed repeatedly during readiness snapshot.",
    ),
  });
};

const validateReadinessSelection = async (
  selection: LanguageAnalysisSelection,
  ctx: OperationContext | undefined,
): Promise<ValidatedConfiguration> => {
  if (
    selection.implementation === null ||
    selection.configurationFingerprint === null
  ) {
    throw new LanguageAnalysisReadinessError("MISSING_SELECTION");
  }
  try {
    const configuration = await validateLanguageAnalyzerConfiguration(
      selection.implementation,
      ctx,
    );
    if (configuration.fingerprint !== selection.configurationFingerprint) {
      throw new LanguageAnalysisReadinessError("INVALID_CONFIGURATION");
    }
    return configuration;
  } catch (error) {
    rethrowCancellation(error, ctx?.signal);
    if (error instanceof LanguageAnalysisReadinessError) throw error;
    const reason = readinessConfigurationFailureReason(error);
    if (reason === undefined) throw error;
    throw new LanguageAnalysisReadinessError(reason, { cause: error });
  }
};

/**
 * Cache configuration proof per effective implementation, then independently
 * prove every effective language. A shared configuration cannot prove that all
 * of its declared model assets are available at runtime.
 */
export const executeLanguageAnalysisReadinessAssessment = async (
  ctx?: OperationContext,
): Promise<void> => {
  const { client } = await getDbHandle();
  const selections = await readStableLanguageAnalysisSelections({
    db: client,
  });
  const wildcard = selections.find(
    (selection) => selection.key === LanguageAnalysisWildcardSelectionKey,
  );
  const exactSelections = selections.filter(
    (selection) => selection.key !== LanguageAnalysisWildcardSelectionKey,
  );
  const exactImplementationKeys = new Set<string>(
    exactSelections
      .filter((selection) => selection.implementation !== null)
      .map((selection) => selection.key),
  );
  const configurations = new Map<string, ValidatedConfiguration>();
  const effectiveLanguages = new Map<
    NormalizedLanguageId,
    LanguageAnalysisSelection
  >();
  const configurationFor = async (
    selection: LanguageAnalysisSelection,
  ): Promise<ValidatedConfiguration> => {
    if (
      selection.implementation === null ||
      selection.configurationFingerprint === null
    ) {
      throw new LanguageAnalysisReadinessError("MISSING_SELECTION");
    }
    const key = `${serviceImplementationReferenceKey(selection.implementation)}\0${selection.configurationFingerprint}`;
    const cached = configurations.get(key);
    if (cached !== undefined) return cached;
    const configuration = await validateReadinessSelection(selection, ctx);
    configurations.set(key, configuration);
    return configuration;
  };

  let wildcardConfiguration: ValidatedConfiguration | undefined;
  if (wildcard?.implementation !== null && wildcard !== undefined) {
    wildcardConfiguration = await configurationFor(wildcard);
    const supportedLanguages = [...wildcardConfiguration.supportedLanguages];
    if (supportedLanguages.length === 0) {
      throw new LanguageAnalysisReadinessError("INVALID_CONFIGURATION");
    }
    for (const languageId of supportedLanguages) {
      if (!exactImplementationKeys.has(languageId)) {
        effectiveLanguages.set(languageId, wildcard);
      }
    }
  }

  for (const selection of exactSelections) {
    const languageId = NormalizedLanguageIdSchema.parse(selection.key);
    if (selection.implementation === null) {
      if (wildcard === undefined || wildcardConfiguration === undefined) {
        throw new LanguageAnalysisReadinessError("MISSING_SELECTION");
      }
      if (!wildcardConfiguration.supportedLanguages.includes(languageId)) {
        throw new LanguageAnalysisReadinessError("UNSUPPORTED_LANGUAGE");
      }
      effectiveLanguages.set(languageId, wildcard);
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop
    const configuration = await configurationFor(selection);
    if (!configuration.supportedLanguages.includes(languageId)) {
      throw new LanguageAnalysisReadinessError("UNSUPPORTED_LANGUAGE");
    }
    effectiveLanguages.set(languageId, selection);
  }

  if (effectiveLanguages.size === 0) {
    throw new LanguageAnalysisReadinessError("MISSING_SELECTION");
  }
  if (effectiveLanguages.size > MAX_READINESS_LIVE_PROBES) {
    throw new LanguageAnalysisReadinessError("INVALID_CONFIGURATION", {
      cause: new Error(
        `Language Analysis readiness has more than ${MAX_READINESS_LIVE_PROBES} effective languages.`,
      ),
    });
  }

  const languages = [...effectiveLanguages.keys()].sort((left, right) =>
    left.localeCompare(right),
  );
  for (const languageId of languages) {
    try {
      // Sequential execution keeps the live dependency probe bounded in both
      // concurrency and total work while the reporter enforces its deadline.
      // oxlint-disable-next-line no-await-in-loop
      await executeRequiredLanguageAnalysis(
        {
          languageId,
          text: "CAT Language Analysis readiness probe.",
          timeoutMs: 1_500,
        },
        ctx,
      );
    } catch (error) {
      rethrowCancellation(error, ctx?.signal);
      if (error instanceof LanguageAnalysisRequirementError) {
        throw new LanguageAnalysisReadinessError(
          error.assessment.blocker?.reason ?? "UNAVAILABLE",
          { cause: error },
        );
      }
      if (error instanceof LanguageAnalysisPolicyChangedError) {
        throw new LanguageAnalysisReadinessError("UNAVAILABLE", {
          cause: error,
        });
      }
      throw error;
    }
  }
};

class InvalidLanguageAnalysisConfigurationError extends Error {}
class LanguageAnalysisInstallationScopeError extends Error {}
