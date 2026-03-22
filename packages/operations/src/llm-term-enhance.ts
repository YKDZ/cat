import type { OperationContext } from "@cat/domain";

import { firstOrGivenService, resolvePluginManager } from "@cat/server-shared";
import { serverLogger as logger } from "@cat/server-shared";
import * as z from "zod";

// ─── Types ───

type RawCandidate = {
  text: string;
  normalizedText: string;
  posPattern: string[];
  confidence: number;
  frequency: number;
  documentFrequency: number;
  source: "statistical" | "llm" | "both";
  existsInGlossary: boolean;
  existingConceptId: number | null;
  occurrences: Array<{
    elementId: number;
    ranges: Array<{ start: number; end: number }>;
  }>;
};

type EnhancedCandidate = RawCandidate & {
  definition: string | null;
  subjects: string[] | null;
};

// ─── Input / Output Schemas ───

export const LlmTermEnhanceInputSchema = z.object({
  candidates: z.array(
    z.object({
      text: z.string(),
      normalizedText: z.string(),
      posPattern: z.array(z.string()),
      confidence: z.number().min(0).max(1),
      frequency: z.int(),
      documentFrequency: z.int(),
      source: z.enum(["statistical", "llm", "both"]),
      existsInGlossary: z.boolean(),
      existingConceptId: z.int().nullable(),
      occurrences: z.array(
        z.object({
          elementId: z.int(),
          ranges: z.array(z.object({ start: z.int(), end: z.int() })),
        }),
      ),
    }),
  ),
  sourceLanguageId: z.string().min(1),
  config: z.object({
    llmProviderId: z.int().optional(),
    confidenceThreshold: z.number().min(0).max(1).default(0.3),
    batchSize: z.int().min(1).max(100).default(20),
    inferDefinition: z.boolean().default(true),
    inferSubject: z.boolean().default(true),
    /** When true (Intl.Segmenter fallback), lower the threshold to validate more candidates */
    useRelaxedThreshold: z.boolean().default(false),
  }),
});

export const LlmTermEnhanceOutputSchema = z.object({
  candidates: z.array(
    z.object({
      text: z.string(),
      normalizedText: z.string(),
      posPattern: z.array(z.string()),
      confidence: z.number().min(0).max(1),
      frequency: z.int(),
      documentFrequency: z.int(),
      source: z.enum(["statistical", "llm", "both"]),
      existsInGlossary: z.boolean(),
      existingConceptId: z.int().nullable(),
      definition: z.string().nullable(),
      subjects: z.array(z.string()).nullable(),
      occurrences: z.array(
        z.object({
          elementId: z.int(),
          ranges: z.array(z.object({ start: z.int(), end: z.int() })),
        }),
      ),
    }),
  ),
  llmCandidatesAdded: z.int(),
});

export type LlmTermEnhanceInput = z.infer<typeof LlmTermEnhanceInputSchema>;
export type LlmTermEnhanceOutput = z.infer<typeof LlmTermEnhanceOutputSchema>;

// ─── LLM Response parsing ───

type LlmTermResult = {
  text: string;
  isTerm: boolean;
  correctedText?: string;
  definition?: string;
  subjects?: string[];
};

const parseJsonSafe = (text: string): LlmTermResult[] => {
  // Extract JSON array from text (handle markdown code block wrapping)
  const match =
    /```(?:json)?\s*([\s\S]*?)```/.exec(text) ?? /(\[[\s\S]*\])/.exec(text);
  const jsonStr = match?.[1]?.trim() ?? text.trim();

  try {
    const parsed: unknown = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return [];
    const items: unknown[] = parsed;
    return items.filter((item): item is LlmTermResult => {
      if (typeof item !== "object" || item === null) return false;
      const rec = item as { text?: unknown; isTerm?: unknown };
      return typeof rec.text === "string" && typeof rec.isTerm === "boolean";
    });
  } catch {
    return [];
  }
};

const formatErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// ─── Prompt builders ───

const buildValidatePrompt = (
  batch: RawCandidate[],
  languageId: string,
  inferDefinition: boolean,
  inferSubject: boolean,
): string => {
  const items = batch
    .map((c, i) => {
      const posInfo =
        c.posPattern.length > 0 && !c.posPattern.every((p) => p === "X")
          ? ` [POS: ${c.posPattern.join(", ")}]`
          : "";
      return `${i + 1}. "${c.text}" (normalized: "${c.normalizedText}"${posInfo}, freq: ${c.frequency})`;
    })
    .join("\n");

  const extraFields = [];
  if (inferDefinition)
    extraFields.push(
      '"definition": "<genus-differentia style definition or null>"',
    );
  if (inferSubject)
    extraFields.push('"subjects": ["<domain1>", "<domain2>"] or null');

  return `You are a terminology extraction expert.

Language: ${languageId}

Below is a list of candidate terms extracted from a translation corpus using statistical methods. For each candidate, determine:
1. Is it a genuine technical/domain term? (not a common word, phrase, or grammatical construct)
2. If yes, optionally provide: corrected surface form, definition, subject domains

Return ONLY a valid JSON array with one object per candidate:
[
  {
    "text": "<original candidate text>",
    "isTerm": true/false,
    "correctedText": "<corrected form if needed, or same as text>",
    ${extraFields.join(",\n    ")}
  }
]

Candidates:
${items}`.trim();
};

// ─── Core Operation ───

/**
 * LLM 术语增强
 *
 * 对低置信度候选进行 LLM 校验：判断是否为真正的术语，
 * 并批量生成 definition 和 subject。
 *
 * 高置信度候选（>= confidenceThreshold）保留统计学结果，仅生成 definition/subject。
 * 低置信度候选需LLM校验后决定是否保留。
 */
export const llmTermEnhanceOp = async (
  data: LlmTermEnhanceInput,
  ctx?: OperationContext,
): Promise<LlmTermEnhanceOutput> => {
  const pluginManager = resolvePluginManager(ctx?.pluginManager);
  const llmService = firstOrGivenService(
    pluginManager,
    "LLM_PROVIDER",
    data.config.llmProviderId,
  );

  if (!llmService) {
    // No LLM available — pass through with null definition/subjects
    return {
      candidates: data.candidates.map((c) => ({
        ...c,
        definition: null,
        subjects: null,
      })),
      llmCandidatesAdded: 0,
    };
  }

  const llm = llmService.service;
  const threshold = data.config.useRelaxedThreshold
    ? data.config.confidenceThreshold * 0.7
    : data.config.confidenceThreshold;

  // Separate high-confidence (already accepted) from low-confidence (needs LLM validation)
  const highConfidence = data.candidates.filter(
    (c) => c.confidence >= threshold,
  );
  const lowConfidence = data.candidates.filter((c) => c.confidence < threshold);

  const enhancedHigh: EnhancedCandidate[] = highConfidence.map((c) => ({
    ...c,
    definition: null,
    subjects: null,
  }));

  const validatedFromLlm: EnhancedCandidate[] = [];
  let llmCandidatesAdded = 0;

  // Process low-confidence candidates in batches (parallel)
  const validationBatches: RawCandidate[][] = Array.from(
    { length: Math.ceil(lowConfidence.length / data.config.batchSize) },
    (_, i) =>
      lowConfidence.slice(
        i * data.config.batchSize,
        (i + 1) * data.config.batchSize,
      ),
  );

  const validationResults = await Promise.all(
    validationBatches.map(async (batch) => {
      const prompt = buildValidatePrompt(
        batch,
        data.sourceLanguageId,
        data.config.inferDefinition,
        data.config.inferSubject,
      );
      try {
        const response = await llm.chat({
          messages: [
            {
              role: "system",
              content:
                "You are a terminology extraction expert. Always respond with valid JSON arrays only.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.1,
          maxTokens: 4096,
          thinking: false,
        });
        return {
          batch,
          results: parseJsonSafe(response.content?.trim() ?? ""),
          error: null,
        };
      } catch (err: unknown) {
        logger
          .withSituation("OP")
          .error(err, "llmTermEnhanceOp: LLM batch failed");
        return {
          batch,
          results: [],
          error: formatErrorMessage(err),
        };
      }
    }),
  );

  const validationErrors = validationResults
    .map((result) => result.error)
    .filter((error): error is string => error !== null);
  if (validationErrors.length > 0) {
    throw new Error(
      `llmTermEnhanceOp validation failed: ${validationErrors[0]}`,
    );
  }

  for (const { batch, results } of validationResults) {
    for (let i = 0; i < batch.length; i += 1) {
      const candidate = batch[i];
      const result = results.find((r) => r.text === candidate?.text);

      if (!candidate) continue;
      if (!result || !result.isTerm) continue;

      const text = result.correctedText ?? candidate.text;
      validatedFromLlm.push({
        text,
        normalizedText: candidate.normalizedText,
        posPattern: candidate.posPattern,
        confidence: Math.max(candidate.confidence, threshold),
        frequency: candidate.frequency,
        documentFrequency: candidate.documentFrequency,
        source: candidate.source === "statistical" ? "both" : candidate.source,
        existsInGlossary: candidate.existsInGlossary,
        existingConceptId: candidate.existingConceptId,
        definition: result.definition ?? null,
        subjects: result.subjects ?? null,
        occurrences: candidate.occurrences,
      });
      llmCandidatesAdded += 1;
    }
  }

  // Generate definition/subjects for high-confidence candidates that need it
  if (data.config.inferDefinition || data.config.inferSubject) {
    const needsEnhancement = enhancedHigh.filter(
      (c) => c.definition === null && c.subjects === null,
    );
    const enhanceBatches: EnhancedCandidate[][] = Array.from(
      { length: Math.ceil(needsEnhancement.length / data.config.batchSize) },
      (_, i) =>
        needsEnhancement.slice(
          i * data.config.batchSize,
          (i + 1) * data.config.batchSize,
        ),
    );

    const extraFields: string[] = [];
    if (data.config.inferDefinition)
      extraFields.push(
        '"definition": "<genus-differentia style definition or null>"',
      );
    if (data.config.inferSubject)
      extraFields.push('"subjects": ["<domain>"] or null');

    const enrichmentResults = await Promise.all(
      enhanceBatches.map(async (batch) => {
        const items = batch
          .map((c, i) => `${i + 1}. "${c.text}" (${c.normalizedText})`)
          .join("\n");

        const prompt = `Language: ${data.sourceLanguageId}

Provide definition and/or subject domains for these confirmed technical terms:
${items}

Return ONLY a valid JSON array:
[
  {
    "text": "<term>",
    "isTerm": true,
    ${extraFields.join(",\n    ")}
  }
]`;

        try {
          const response = await llm.chat({
            messages: [
              {
                role: "system",
                content:
                  "You are a terminology expert. Always respond with valid JSON arrays only.",
              },
              { role: "user", content: prompt },
            ],
            temperature: 0.1,
            maxTokens: 4096,
            thinking: false,
          });
          return {
            batch,
            results: parseJsonSafe(response.content?.trim() ?? ""),
            error: null,
          };
        } catch (err: unknown) {
          logger
            .withSituation("OP")
            .error(err, "llmTermEnhanceOp: definition batch failed");
          return {
            batch,
            results: [],
            error: formatErrorMessage(err),
          };
        }
      }),
    );

    const enrichmentErrors = enrichmentResults
      .map((result) => result.error)
      .filter((error): error is string => error !== null);
    if (enrichmentErrors.length > 0) {
      throw new Error(
        `llmTermEnhanceOp enrichment failed: ${enrichmentErrors[0]}`,
      );
    }

    for (const { batch, results } of enrichmentResults) {
      for (const candidate of batch) {
        const result = results.find((r) => r.text === candidate.text);
        if (result) {
          candidate.definition = result.definition ?? null;
          candidate.subjects = result.subjects ?? null;
        }
      }
    }
  }

  const allCandidates = [...enhancedHigh, ...validatedFromLlm];
  allCandidates.sort((a, b) => b.confidence - a.confidence);

  return { candidates: allCandidates, llmCandidatesAdded };
};
