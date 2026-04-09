import type { OperationContext } from "@cat/domain";

import { resolvePluginManager } from "@cat/server-shared";
import { serverLogger as logger } from "@cat/server-shared";
import * as z from "zod";

import { createVectorizedStringOp } from "./create-vectorized-string";

// ─── Input / Output Schemas ───

export const VectorTermAlignInputSchema = z.object({
  termGroups: z.array(
    z.object({
      languageId: z.string().min(1),
      candidates: z.array(
        z.object({
          text: z.string(),
          normalizedText: z.string().optional(),
          definition: z.string().nullable().optional(),
        }),
      ),
    }),
  ),
  config: z.object({
    vectorizerId: z.int(),
    vectorStorageId: z.int(),
    minSimilarity: z.number().min(0).max(1).default(0.75),
  }),
});

export const VectorTermAlignOutputSchema = z.object({
  /** Pairs of (groupAIndex, candidateAIndex, groupBIndex, candidateBIndex, similarity, stringIds) */
  alignedPairs: z.array(
    z.object({
      groupAIndex: z.int(),
      candidateAIndex: z.int(),
      groupBIndex: z.int(),
      candidateBIndex: z.int(),
      similarity: z.number().min(0).max(1),
    }),
  ),
  /** stringId per (groupIndex, candidateIndex) — created during vectorization */
  stringIds: z.array(
    z.object({
      groupIndex: z.int(),
      candidateIndex: z.int(),
      stringId: z.int(),
    }),
  ),
});

export type VectorTermAlignInput = z.infer<typeof VectorTermAlignInputSchema>;
export type VectorTermAlignOutput = z.infer<typeof VectorTermAlignOutputSchema>;

/**
 * @zh 向量相似度术语对齐。
 *
 * 1. 把每个候选术语（text + definition）向量化并创建正式 TranslatableString
 * 2. 跨语言组进行两两余弦相似度对比
 * 3. 相似度 \>= minSimilarity 的配对记录进 alignedPairs
 * @en Term alignment via vector cosine similarity.
 *
 * 1. Vectorize each candidate term (text + definition) and create a
 *    formal TranslatableString
 * 2. Perform pairwise cosine-similarity comparison across language groups
 * 3. Record pairs with similarity >= minSimilarity into alignedPairs
 *
 * @param data - {@zh 向量对齐输入参数} {@en Vector alignment input parameters}
 * @param ctx - {@zh 操作上下文} {@en Operation context}
 * @returns - {@zh 对齐的术语对及每个候选的 stringId 列表} {@en Aligned term pairs and the stringId list for each candidate}
 */
export const vectorTermAlignOp = async (
  data: VectorTermAlignInput,
  ctx?: OperationContext,
): Promise<VectorTermAlignOutput> => {
  const pluginManager = resolvePluginManager(ctx?.pluginManager);

  const vectorizerService = pluginManager
    .getServices("TEXT_VECTORIZER")
    .find((s) => s.dbId === data.config.vectorizerId)?.service;
  const vectorStorageService = pluginManager
    .getServices("VECTOR_STORAGE")
    .find((s) => s.dbId === data.config.vectorStorageId)?.service;

  if (!vectorizerService || !vectorStorageService) {
    logger
      .withSituation("OP")
      .warn(
        "vectorTermAlignOp: TEXT_VECTORIZER or VECTOR_STORAGE not available, skipping vector alignment",
      );
    return { alignedPairs: [], stringIds: [] };
  }

  // Step 1: Vectorize all candidates and create TranslatableStrings
  type CandidateRef = {
    groupIndex: number;
    candidateIndex: number;
    languageId: string;
    vectorText: string;
    stringId: number | null;
    vector: number[] | null;
  };

  const refs: CandidateRef[] = [];

  for (let gi = 0; gi < data.termGroups.length; gi += 1) {
    const group = data.termGroups[gi];
    if (!group) continue;
    for (let ci = 0; ci < group.candidates.length; ci += 1) {
      const candidate = group.candidates[ci];
      if (!candidate) continue;
      const vectorText = candidate.definition
        ? `${candidate.text}. ${candidate.definition}`
        : candidate.text;

      refs.push({
        groupIndex: gi,
        candidateIndex: ci,
        languageId: group.languageId,
        vectorText,
        stringId: null,
        vector: null,
      });
    }
  }

  if (refs.length === 0) {
    return { alignedPairs: [], stringIds: [] };
  }

  // Create TranslatableStrings (Decision #4-C: store in formal ChunkSet)
  const stringResult = await createVectorizedStringOp(
    {
      data: refs.map((r) => ({ text: r.vectorText, languageId: r.languageId })),
      vectorizerId: data.config.vectorizerId,
      vectorStorageId: data.config.vectorStorageId,
    },
    ctx,
  );

  for (let i = 0; i < refs.length; i += 1) {
    const ref = refs[i];
    const stringId = stringResult.stringIds[i];
    if (ref && stringId !== undefined) {
      ref.stringId = stringId;
    }
  }

  // Vectorize again in-memory to get raw vectors for cosine similarity
  const chunkData = await vectorizerService.vectorize({
    elements: refs.map((r) => ({
      text: r.vectorText,
      languageId: r.languageId,
    })),
  });

  for (let i = 0; i < refs.length; i += 1) {
    const ref = refs[i];
    const chunks = chunkData[i];
    if (ref && chunks && chunks.length > 0 && chunks[0]) {
      ref.vector = chunks[0].vector;
    }
  }

  // Step 2: Cross-language pair comparison
  const alignedPairs: VectorTermAlignOutput["alignedPairs"] = [];

  for (let ai = 0; ai < data.termGroups.length; ai += 1) {
    for (let bi = ai + 1; bi < data.termGroups.length; bi += 1) {
      const groupARefs = refs.filter((r) => r.groupIndex === ai);
      const groupBRefs = refs.filter((r) => r.groupIndex === bi);

      for (const refA of groupARefs) {
        if (!refA.vector) continue;

        for (const refB of groupBRefs) {
          if (!refB.vector) continue;

          const similarity = cosineSimilarity(refA.vector, refB.vector);
          if (similarity >= data.config.minSimilarity) {
            alignedPairs.push({
              groupAIndex: ai,
              candidateAIndex: refA.candidateIndex,
              groupBIndex: bi,
              candidateBIndex: refB.candidateIndex,
              similarity,
            });
          }
        }
      }
    }
  }

  const stringIds = refs
    .filter(
      (r): r is CandidateRef & { stringId: number } => r.stringId !== null,
    )
    .map((r) => ({
      groupIndex: r.groupIndex,
      candidateIndex: r.candidateIndex,
      stringId: r.stringId,
    }));

  return { alignedPairs, stringIds };
};

// ─── Helpers ───

const cosineSimilarity = (a: number[], b: number[]): number => {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
};
