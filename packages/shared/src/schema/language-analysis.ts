import * as z from "zod";

import {
  type ServiceImplementationReference,
  serviceImplementationReferenceKey,
  ServiceImplementationReferenceSchema,
} from "#/schema/service-implementation-reference.ts";

declare const normalizedLanguageId: unique symbol;
declare const languageAnalysisVersion: unique symbol;

export type NormalizedLanguageId = string & {
  readonly [normalizedLanguageId]: "NormalizedLanguageId";
};

export type LanguageAnalysisVersion = string & {
  readonly [languageAnalysisVersion]: "LanguageAnalysisVersion";
};

/** A content-addressed host version of validated Language Analysis output. */
export const LanguageAnalysisVersionSchema = z
  .string()
  .regex(
    /^sha256:[a-f0-9]{64}$/,
    "Language Analysis Version must be sha256:<64 lower hex>.",
  )
  .transform(
    (value): LanguageAnalysisVersion => value as LanguageAnalysisVersion,
  );

const rejectWhitespace = (value: string, ctx: z.RefinementCtx): void => {
  if (value !== value.trim()) {
    ctx.addIssue({
      code: "custom",
      message: "Language IDs must not contain surrounding whitespace.",
    });
  }
};

/** Canonicalizes locale identifiers with Node's ICU/CLDR-backed BCP 47 registry. */
export const normalizeLanguageId = (value: string): NormalizedLanguageId => {
  if (value !== value.trim()) {
    throw new TypeError(
      "Language IDs must not contain surrounding whitespace.",
    );
  }

  try {
    const [canonical] = Intl.getCanonicalLocales(value);
    if (canonical === undefined) throw new TypeError("Empty locale list.");
    return canonical as NormalizedLanguageId;
  } catch (error) {
    throw new TypeError(`Invalid BCP 47 language ID: ${value}`, {
      cause: error,
    });
  }
};

export const NormalizedLanguageIdSchema = z
  .string()
  .superRefine(rejectWhitespace)
  .transform((value, ctx): NormalizedLanguageId => {
    try {
      return normalizeLanguageId(value);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message:
          error instanceof Error
            ? error.message
            : "Invalid BCP 47 language ID.",
      });
      return z.NEVER;
    }
  });

const SupportedLanguageIdsSchema = z
  .array(NormalizedLanguageIdSchema)
  .min(1)
  .superRefine((languageIds, ctx) => {
    if (new Set(languageIds).size !== languageIds.length) {
      ctx.addIssue({
        code: "custom",
        message: "Supported language IDs must be unique after normalization.",
      });
    }
  });

/** Host-validated static declaration from configured analyzer state. */
export const LanguageAnalyzerConfigurationAssessmentSchema =
  z.discriminatedUnion("status", [
    z.strictObject({
      status: z.literal("VALID"),
      supportedLanguages: SupportedLanguageIdsSchema,
      semanticConfiguration: z.record(z.string(), z.json()),
    }),
    z.strictObject({
      status: z.literal("INVALID"),
      reason: z.literal("INVALID_CONFIGURATION"),
    }),
  ]);

export type LanguageAnalyzerConfigurationAssessment = z.infer<
  typeof LanguageAnalyzerConfigurationAssessmentSchema
>;

export const LanguageAnalysisTokenSchema = z
  .strictObject({
    text: z.string(),
    lemma: z.string(),
    pos: z.string(),
    start: z.int().nonnegative(),
    end: z.int().nonnegative(),
    isStop: z.boolean(),
    isPunct: z.boolean(),
  })
  .refine((token) => token.end > token.start, {
    message: "Token ranges must be non-empty.",
  });

export const LanguageAnalysisSentenceSchema = z
  .strictObject({
    text: z.string(),
    tokens: z.array(LanguageAnalysisTokenSchema),
    start: z.int().nonnegative(),
    end: z.int().nonnegative(),
  })
  .refine((sentence) => sentence.end > sentence.start, {
    message: "Sentence ranges must be non-empty.",
  });

export const LanguageAnalysisImplementationSchema = z.strictObject({
  reference: ServiceImplementationReferenceSchema.refine(
    (reference) => reference.serviceType === "LANGUAGE_ANALYZER",
    "Language Analysis must attest a LANGUAGE_ANALYZER implementation reference.",
  ),
  packageName: z.string().min(1),
  packageVersion: z.string().min(1),
});

export const LanguageAnalysisAssetSchema = z.strictObject({
  id: z.string().min(1),
  version: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export const LanguageAnalysisGenerationSchema = z.strictObject({
  id: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  planDigest: z.string().regex(/^[a-f0-9]{64}$/),
  schemaVersion: z.string().min(1),
  provisionerVersion: z.string().min(1),
  serverProtocolVersion: z.string().min(1),
  pythonAbi: z.string().min(1),
  pythonImplementation: z.string().min(1),
  pythonVersion: z.string().min(1),
  platform: z.string().min(1),
  spacyVersion: z.string().min(1),
  sitePackagesDigest: z.string().regex(/^[a-f0-9]{64}$/),
});

export const LanguageAnalysisAttestationSchema = z.strictObject({
  contract: z.literal("cat.language-analysis/v1"),
  languageId: NormalizedLanguageIdSchema,
  implementation: LanguageAnalysisImplementationSchema,
  generation: LanguageAnalysisGenerationSchema,
  semanticConfig: z.record(z.string(), z.json()),
  engine: z.strictObject({
    name: z.string().min(1),
    version: z.string().min(1),
  }),
  pipeline: z.strictObject({
    id: z.string().min(1),
    version: z.string().min(1),
  }),
  model: z.strictObject({ id: z.string().min(1), version: z.string().min(1) }),
  assets: z.array(LanguageAnalysisAssetSchema).min(1),
});

export const LanguageAnalysisResultSchema = z.strictObject({
  sentences: z.array(LanguageAnalysisSentenceSchema),
  tokens: z.array(LanguageAnalysisTokenSchema),
  attestation: LanguageAnalysisAttestationSchema,
});

export const LanguageAnalysisBatchResultSchema = z.strictObject({
  attestation: LanguageAnalysisAttestationSchema,
  results: z.array(
    z.strictObject({ id: z.string(), result: LanguageAnalysisResultSchema }),
  ),
});

export type LanguageAnalysisToken = z.infer<typeof LanguageAnalysisTokenSchema>;
export type LanguageAnalysisSentence = z.infer<
  typeof LanguageAnalysisSentenceSchema
>;
export type LanguageAnalysisAttestation = z.infer<
  typeof LanguageAnalysisAttestationSchema
>;
export type LanguageAnalysisResult = z.infer<
  typeof LanguageAnalysisResultSchema
>;
export type LanguageAnalysisBatchResult = z.infer<
  typeof LanguageAnalysisBatchResultSchema
>;

type ExpectedImplementation = {
  reference: ServiceImplementationReference;
  packageName: string;
  packageVersion: string;
};

type LanguageAnalysisValidationOptions = {
  text: string;
  implementation: ExpectedImplementation;
};

type LanguageAnalysisBatchValidationOptions = {
  items: ReadonlyArray<{ id: string; text: string }>;
  implementation: ExpectedImplementation;
};

export const LanguageAnalysisValidationCodeValues = [
  "INVALID_RESPONSE",
  "INVALID_ATTESTATION",
] as const;
export type LanguageAnalysisValidationCode =
  (typeof LanguageAnalysisValidationCodeValues)[number];

const validationCodeForIssues = (
  issues: readonly z.core.$ZodIssue[],
): LanguageAnalysisValidationCode =>
  issues.some((issue) => issue.path.includes("attestation"))
    ? "INVALID_ATTESTATION"
    : "INVALID_RESPONSE";

export class LanguageAnalysisValidationError extends Error {
  public readonly code: LanguageAnalysisValidationCode;

  public constructor(
    code: LanguageAnalysisValidationCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "LanguageAnalysisValidationError";
    this.code = code;
  }
}

export const stableSerializeLanguageAnalysis = (value: unknown): string => {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new TypeError("Non-finite values are not serializable.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableSerializeLanguageAnalysis).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableSerializeLanguageAnalysis(record[key])}`,
      )
      .join(",")}}`;
  }
  throw new TypeError("Language Analysis inputs must be JSON values.");
};

export const computeLanguageAnalysisVersion = async (
  attestation: LanguageAnalysisAttestation,
): Promise<LanguageAnalysisVersion> => {
  const verified = LanguageAnalysisAttestationSchema.parse(attestation);
  const content = new TextEncoder().encode(
    stableSerializeLanguageAnalysis(verified),
  );
  const digest = await crypto.subtle.digest("SHA-256", content);
  return LanguageAnalysisVersionSchema.parse(
    `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`,
  );
};

const validateImplementation = (
  attestation: LanguageAnalysisAttestation,
  implementation: ExpectedImplementation,
): void => {
  if (
    serviceImplementationReferenceKey(attestation.implementation.reference) !==
    serviceImplementationReferenceKey(implementation.reference)
  ) {
    throw new LanguageAnalysisValidationError(
      "INVALID_ATTESTATION",
      "Language Analysis attestation implementation does not match the resolved implementation.",
    );
  }
  if (
    attestation.implementation.packageName !== implementation.packageName ||
    attestation.implementation.packageVersion !== implementation.packageVersion
  ) {
    throw new LanguageAnalysisValidationError(
      "INVALID_ATTESTATION",
      "Language Analysis attestation package identity does not match the resolved implementation.",
    );
  }
};

const validateRange = (
  text: string,
  range: { text: string; start: number; end: number },
  kind: "sentence" | "token",
): void => {
  if (text.slice(range.start, range.end) !== range.text) {
    throw new LanguageAnalysisValidationError(
      "INVALID_RESPONSE",
      `Language Analysis ${kind} range does not match the requested text in UTF-16 code units.`,
    );
  }
};

const validateOrderedNonOverlappingRanges = (
  ranges: readonly { start: number; end: number }[],
  kind: "sentence" | "token",
): void => {
  let previousEnd = 0;
  for (const range of ranges) {
    if (range.start < previousEnd) {
      throw new LanguageAnalysisValidationError(
        "INVALID_RESPONSE",
        `Language Analysis ${kind} ranges must be source-ordered and non-overlapping.`,
      );
    }
    previousEnd = range.end;
  }
};

const validateStructure = (
  result: LanguageAnalysisResult,
  text: string,
): void => {
  validateOrderedNonOverlappingRanges(result.sentences, "sentence");
  const sentenceTokens = result.sentences.flatMap((sentence) => {
    validateRange(text, sentence, "sentence");
    validateOrderedNonOverlappingRanges(sentence.tokens, "token");
    for (const token of sentence.tokens) {
      validateRange(text, token, "token");
      if (token.start < sentence.start || token.end > sentence.end) {
        throw new LanguageAnalysisValidationError(
          "INVALID_RESPONSE",
          "Language Analysis token range must be contained by its sentence range.",
        );
      }
    }
    return sentence.tokens;
  });
  validateOrderedNonOverlappingRanges(result.tokens, "token");
  for (const token of result.tokens) validateRange(text, token, "token");

  if (
    stableSerializeLanguageAnalysis(sentenceTokens) !==
    stableSerializeLanguageAnalysis(result.tokens)
  ) {
    throw new LanguageAnalysisValidationError(
      "INVALID_RESPONSE",
      "Language Analysis top-level tokens must exactly equal sentence tokens in order.",
    );
  }
};

export const validateLanguageAnalysisResult = (
  value: unknown,
  requestedLanguageId: NormalizedLanguageId,
  options: LanguageAnalysisValidationOptions,
): LanguageAnalysisResult => {
  const parsed = LanguageAnalysisResultSchema.safeParse(value);
  if (!parsed.success) {
    throw new LanguageAnalysisValidationError(
      validationCodeForIssues(parsed.error.issues),
      "Language Analysis response does not match its contract.",
      { cause: parsed.error },
    );
  }
  const result = parsed.data;
  if (result.attestation.languageId !== requestedLanguageId) {
    throw new LanguageAnalysisValidationError(
      "INVALID_ATTESTATION",
      "Language Analysis attestation language does not match the request.",
    );
  }
  validateImplementation(result.attestation, options.implementation);
  validateStructure(result, options.text);
  return result;
};

export const validateLanguageAnalysisBatchResult = (
  value: unknown,
  requestedLanguageId: NormalizedLanguageId,
  options: LanguageAnalysisBatchValidationOptions,
): LanguageAnalysisBatchResult => {
  if (options.items.length === 0) {
    throw new LanguageAnalysisValidationError(
      "INVALID_RESPONSE",
      "Language Analysis batch requests must be non-empty.",
    );
  }
  if (
    new Set(options.items.map((item) => item.id)).size !== options.items.length
  ) {
    throw new LanguageAnalysisValidationError(
      "INVALID_RESPONSE",
      "Language Analysis batch request IDs must be unique.",
    );
  }
  const parsed = LanguageAnalysisBatchResultSchema.safeParse(value);
  if (!parsed.success) {
    throw new LanguageAnalysisValidationError(
      validationCodeForIssues(parsed.error.issues),
      "Language Analysis batch response does not match its contract.",
      { cause: parsed.error },
    );
  }
  const result = parsed.data;
  if (result.attestation.languageId !== requestedLanguageId) {
    throw new LanguageAnalysisValidationError(
      "INVALID_ATTESTATION",
      "Language Analysis batch attestation language does not match the request.",
    );
  }
  validateImplementation(result.attestation, options.implementation);
  if (result.results.length !== options.items.length) {
    throw new LanguageAnalysisValidationError(
      "INVALID_RESPONSE",
      "Language Analysis batch response count does not match the request.",
    );
  }
  for (const [index, entry] of result.results.entries()) {
    const item = options.items[index];
    if (item === undefined || entry.id !== item.id) {
      throw new LanguageAnalysisValidationError(
        "INVALID_RESPONSE",
        "Language Analysis batch response IDs must match request IDs in order.",
      );
    }
    const analysis = validateLanguageAnalysisResult(
      entry.result,
      requestedLanguageId,
      { text: item.text, implementation: options.implementation },
    );
    if (
      stableSerializeLanguageAnalysis(analysis.attestation) !==
      stableSerializeLanguageAnalysis(result.attestation)
    ) {
      throw new LanguageAnalysisValidationError(
        "INVALID_ATTESTATION",
        "Language Analysis batch result attestation does not match the batch attestation.",
      );
    }
  }
  return result;
};
