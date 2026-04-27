import type { HnfCandidate, HardNegativeRemoval } from "./types";

/**
 * @zh 从源 NLP tokens 提取内容词（非停用词、非标点的 lemma 小写形式）。
 * @en Extract content words from source NLP tokens (non-stop, non-punct lemmas, lowercased).
 */
export const extractContentWordsFromTokens = (
  tokens: Array<{
    lemma: string;
    isStop: boolean;
    isPunct: boolean;
    pos: string;
  }>,
): { contentWords: string[]; keyNouns: string[] } => {
  const contentWords: string[] = [];
  const keyNouns: string[] = [];
  for (const t of tokens) {
    if (!t.isStop && !t.isPunct) {
      const word = t.lemma.toLowerCase();
      contentWords.push(word);
      if (t.pos === "NOUN" || t.pos === "PROPN") {
        keyNouns.push(word);
      }
    }
  }
  return { contentWords, keyNouns };
};

/**
 * @zh 计算内容词交集大小。
 * @en Compute content word intersection size.
 */
const computeContentWordIntersection = (
  queryContentWords: string[],
  candidateTextLower: string,
): number => {
  let hits = 0;
  for (const word of queryContentWords) {
    if (candidateTextLower.includes(word)) {
      hits += 1;
    }
  }
  return hits;
};

/**
 * @zh 应用 HNF 预管道规则（1, 2, 3）。
 *
 * 规则 1：孤立语义候选抑制
 * 规则 2：Sparse 反证折减
 * 规则 3：Content-Word Intersection Gate
 * @en Apply HNF pre-pipeline rules (1, 2, 3).
 *
 * @param candidates - {@zh 候选列表} {@en Candidate list}
 * @param queryContentWords - {@zh 查询的内容词} {@en Query content words}
 * @param queryKeyNouns - {@zh 查询的关键名词（NOUN/PROPN）} {@en Query key nouns (NOUN/PROPN pos)}
 * @param queryTextLength - {@zh 查询文本长度} {@en Query text character length}
 * @returns - {@zh 过滤后保留的候选和移除记录} {@en Kept candidates and removal records}
 */
export const applyHnfPreRules = (
  candidates: HnfCandidate[],
  queryContentWords: string[],
  queryKeyNouns: string[],
  queryTextLength: number,
): { kept: HnfCandidate[]; removals: HardNegativeRemoval[] } => {
  const removals: HardNegativeRemoval[] = [];
  const modified: HnfCandidate[] = [];

  for (const c of candidates) {
    const intersectionSize = computeContentWordIntersection(
      queryContentWords,
      c.candidateTextLower,
    );
    const hasIntersection = intersectionSize > 0;

    // Check evidence channels
    const evidenceChannels = new Set(c.evidences.map((e) => e.channel));
    const hasOnlySemantic =
      evidenceChannels.has("semantic") &&
      !evidenceChannels.has("exact") &&
      !evidenceChannels.has("bm25") &&
      !evidenceChannels.has("trgm") &&
      !evidenceChannels.has("template") &&
      !evidenceChannels.has("fragment") &&
      !evidenceChannels.has("sparse");

    const candidateTextLen = c.candidateTextLower.length;
    const lengthRatio =
      queryTextLength > 0 ? candidateTextLen / queryTextLength : 1;
    const lengthAnomaly = lengthRatio > 3 || lengthRatio < 0.33;

    // Rule 1: Isolated semantic candidate suppression
    let removed = false;
    if (hasOnlySemantic && !hasIntersection && lengthAnomaly) {
      // Check if any key nouns from source appear in candidate text
      const keyNounInCandidate = queryKeyNouns.some((noun) =>
        c.candidateTextLower.includes(noun),
      );
      if (!keyNounInCandidate) {
        removals.push({
          surface: c.surface,
          candidateKey: c.candidateKey,
          reason: "isolated-semantic",
          stage: "pre-pipeline",
          detail: `intersection=0, lengthRatio=${lengthRatio.toFixed(2)}, keyNounsMissing`,
        });
        removed = true;
      }
    }

    if (removed) continue;

    // Rule 2: Sparse disconfirmation discount
    const semanticEv = c.evidences.find((e) => e.channel === "semantic");
    const sparseEv = c.evidences.find((e) => e.channel === "sparse");
    if (
      semanticEv &&
      sparseEv &&
      sparseEv.confidence < 0.2 &&
      semanticEv.confidence > 0.7
    ) {
      const discountFactor = Math.max(sparseEv.confidence, 0.3);
      c.confidence = c.confidence * discountFactor;
      // Also discount the semantic evidence confidence
      const updatedEvidences = c.evidences.map((e) =>
        e.channel === "semantic"
          ? { ...e, confidence: e.confidence * discountFactor }
          : e,
      );
      c.evidences = updatedEvidences;
    }

    // Rule 3: Content-word intersection gate (non-exact, non-template)
    if (
      !hasIntersection &&
      !evidenceChannels.has("exact") &&
      !evidenceChannels.has("template")
    ) {
      removals.push({
        surface: c.surface,
        candidateKey: c.candidateKey,
        reason: "cw-zero-intersection",
        stage: "pre-pipeline",
        detail: `no content words overlap; channels: ${[...evidenceChannels].join(",")}`,
      });
      continue;
    }

    modified.push(c);
  }

  return { kept: modified, removals };
};

/**
 * @zh 应用 HNF 后管道规则（规则 4：Tier-3 孤立语义判定）。
 * @en Apply HNF post-pipeline rules (rule 4: Tier-3 isolated semantic judgment).
 *
 * @param candidates - {@zh 精排后的候选列表（含 tier 信息）} {@en Ranked candidates with tier info}
 * @param queryContentWords - {@zh 查询的内容词} {@en Query content words}
 * @returns - {@zh 过滤后保留的候选和移除记录} {@en Kept candidates and removal records}
 */
export const applyHnfPostRules = (
  candidates: Array<
    HnfCandidate & {
      tier?: string;
      hardFiltered?: boolean;
      hardFilterReason?: string;
    }
  >,
  queryContentWords: string[],
): {
  kept: Array<
    HnfCandidate & {
      tier?: string;
      hardFiltered?: boolean;
      hardFilterReason?: string;
    }
  >;
  removals: HardNegativeRemoval[];
} => {
  const removals: HardNegativeRemoval[] = [];
  const kept: Array<
    HnfCandidate & {
      tier?: string;
      hardFiltered?: boolean;
      hardFilterReason?: string;
    }
  > = [];

  for (const c of candidates) {
    if (c.tier !== "3") {
      kept.push(c);
      continue;
    }

    // Rule 4: Tier-3 isolated semantic — only remove if semantic-only AND no content word overlap
    const evidenceChannels = new Set(c.evidences.map((e) => e.channel));
    const hasOnlySemantic =
      evidenceChannels.has("semantic") && evidenceChannels.size === 1;

    if (!hasOnlySemantic) {
      kept.push(c);
      continue;
    }

    const intersectionSize = computeContentWordIntersection(
      queryContentWords,
      c.candidateTextLower,
    );

    if (intersectionSize === 0) {
      removals.push({
        surface: c.surface,
        candidateKey: c.candidateKey,
        reason: "tier3-isolated-semantic",
        stage: "post-pipeline",
        detail: `tier=3, semantic-only, cw-intersection=0`,
      });
      c.hardFiltered = true;
      c.hardFilterReason = "tier3-isolated-semantic";
      // Don't push to kept — effectively removed
      continue;
    }

    kept.push(c);
  }

  return { kept, removals };
};
