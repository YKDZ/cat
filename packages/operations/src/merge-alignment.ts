import * as z from "zod";

// ─── Input / Output Schemas ───

export const MergeAlignmentInputSchema = z.object({
  termGroups: z.array(
    z.object({
      languageId: z.string().min(1),
      candidates: z.array(
        z.object({
          text: z.string(),
          normalizedText: z.string().optional(),
          confidence: z.number().optional(),
          definition: z.string().nullable().optional(),
          subjects: z.array(z.string()).nullable().optional(),
        }),
      ),
    }),
  ),
  /** Pairs from vector cosine similarity alignment */
  vectorPairs: z
    .array(
      z.object({
        groupAIndex: z.int(),
        candidateAIndex: z.int(),
        groupBIndex: z.int(),
        candidateBIndex: z.int(),
        similarity: z.number().min(0).max(1),
      }),
    )
    .default([]),
  /** Pairs from statistical co-occurrence alignment */
  statisticalPairs: z
    .array(
      z.object({
        groupAIndex: z.int(),
        candidateAIndex: z.int(),
        groupBIndex: z.int(),
        candidateBIndex: z.int(),
        coOccurrenceScore: z.number().min(0).max(1),
      }),
    )
    .default([]),
  /** Pairs from LLM alignment */
  llmPairs: z
    .array(
      z.object({
        groupAIndex: z.int(),
        candidateAIndex: z.int(),
        groupBIndex: z.int(),
        candidateBIndex: z.int(),
        llmScore: z.number().min(0).max(1),
      }),
    )
    .default([]),
  /** Per-candidate stringIds created during vectorization */
  stringIds: z
    .array(
      z.object({
        groupIndex: z.int(),
        candidateIndex: z.int(),
        stringId: z.int(),
      }),
    )
    .default([]),
  config: z
    .object({
      weights: z
        .object({
          vector: z.number().min(0).default(0.5),
          statistical: z.number().min(0).default(0.3),
          llm: z.number().min(0).default(0.2),
        })
        .optional(),
      minFusedScore: z.number().min(0).max(1).default(0.4),
    })
    .optional(),
});

export const MergeAlignmentOutputSchema = z.object({
  alignedGroups: z.array(
    z.object({
      terms: z.array(
        z.object({
          languageId: z.string(),
          text: z.string(),
          normalizedText: z.string().optional(),
          definition: z.string().nullable().optional(),
          subjects: z.array(z.string()).nullable().optional(),
          stringId: z.int().nullable().optional(),
        }),
      ),
      confidence: z.number().min(0).max(1),
      alignmentSources: z.array(z.enum(["vector", "statistical", "llm"])),
    }),
  ),
  unaligned: z.array(
    z.object({
      text: z.string(),
      languageId: z.string(),
      reason: z.string(),
    }),
  ),
  stats: z.object({
    totalInputTerms: z.int(),
    totalAlignedGroups: z.int(),
    vectorAlignments: z.int(),
    statisticalAlignments: z.int(),
    llmAlignments: z.int(),
  }),
});

export type MergeAlignmentInput = z.infer<typeof MergeAlignmentInputSchema>;
export type MergeAlignmentOutput = z.infer<typeof MergeAlignmentOutputSchema>;

// ─── Helpers ───

type AlignSource = "vector" | "statistical" | "llm";

type FusedPair = {
  gA: number;
  cA: number;
  gB: number;
  cB: number;
  score: number;
  sources: AlignSource[];
};

const nodeKey = (g: number, c: number): string => `${g}:${c}`;

const pairKey = (gA: number, cA: number, gB: number, cB: number): string => {
  if (gA < gB || (gA === gB && cA <= cB)) return `${gA}:${cA}|${gB}:${cB}`;
  return `${gB}:${cB}|${gA}:${cA}`;
};

/** Path-compressed Union-Find */
const makeUnionFind = () => {
  const parent = new Map<string, string>();
  const rank = new Map<string, number>();

  const find = (x: string): string => {
    if (!parent.has(x)) {
      parent.set(x, x);
      rank.set(x, 0);
    }
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
    return parent.get(x)!;
  };

  const union = (x: string, y: string) => {
    const rx = find(x);
    const ry = find(y);
    if (rx === ry) return;
    const rankX = rank.get(rx) ?? 0;
    const rankY = rank.get(ry) ?? 0;
    if (rankX < rankY) parent.set(rx, ry);
    else if (rankX > rankY) parent.set(ry, rx);
    else {
      parent.set(ry, rx);
      rank.set(rx, rankX + 1);
    }
  };

  return { find, union };
};

/**
 * 多策略对齐结果融合
 *
 * 1. 将向量、统计、LLM 三路对齐结果按加权平均融合
 * 2. 通过 Union-Find 进行传递闭包，生成多语言术语组
 * 3. 冲突解决：同语言多候选保留连接度最高的候选
 */
export const mergeAlignmentOp = (
  data: MergeAlignmentInput,
): MergeAlignmentOutput => {
  const weights = data.config?.weights ?? {
    vector: 0.5,
    statistical: 0.3,
    llm: 0.2,
  };
  const total = weights.vector + weights.statistical + weights.llm;
  const wV = total > 0 ? weights.vector / total : 1 / 3;
  const wS = total > 0 ? weights.statistical / total : 1 / 3;
  const wL = total > 0 ? weights.llm / total : 1 / 3;
  const minScore = data.config?.minFusedScore ?? 0.4;

  // ── 1. Collect all raw scores per canonical pair ────────────────────────────

  type RawScores = {
    vectorScore: number;
    statScore: number;
    llmScore: number;
    sources: Set<AlignSource>;
    gA: number;
    cA: number;
    gB: number;
    cB: number;
  };

  const rawPairs = new Map<string, RawScores>();

  const getOrCreate = (
    gA: number,
    cA: number,
    gB: number,
    cB: number,
  ): RawScores => {
    const key = pairKey(gA, cA, gB, cB);
    if (!rawPairs.has(key)) {
      // Store in canonical orientation (lower gA first)
      const [ngA, ncA, ngB, ncB] =
        gA < gB || (gA === gB && cA <= cB)
          ? [gA, cA, gB, cB]
          : [gB, cB, gA, cA];
      rawPairs.set(key, {
        vectorScore: 0,
        statScore: 0,
        llmScore: 0,
        sources: new Set(),
        gA: ngA,
        cA: ncA,
        gB: ngB,
        cB: ncB,
      });
    }
    return rawPairs.get(key)!;
  };

  for (const p of data.vectorPairs) {
    const rs = getOrCreate(
      p.groupAIndex,
      p.candidateAIndex,
      p.groupBIndex,
      p.candidateBIndex,
    );
    rs.vectorScore = Math.max(rs.vectorScore, p.similarity);
    rs.sources.add("vector");
  }

  for (const p of data.statisticalPairs) {
    const rs = getOrCreate(
      p.groupAIndex,
      p.candidateAIndex,
      p.groupBIndex,
      p.candidateBIndex,
    );
    rs.statScore = Math.max(rs.statScore, p.coOccurrenceScore);
    rs.sources.add("statistical");
  }

  for (const p of data.llmPairs) {
    const rs = getOrCreate(
      p.groupAIndex,
      p.candidateAIndex,
      p.groupBIndex,
      p.candidateBIndex,
    );
    rs.llmScore = Math.max(rs.llmScore, p.llmScore);
    rs.sources.add("llm");
  }

  // ── 2. Compute fused scores and filter ─────────────────────────────────────

  const fusedPairs: FusedPair[] = [];
  let vectorAlignments = 0;
  let statAlignments = 0;
  let llmAlignments = 0;

  for (const rs of rawPairs.values()) {
    const fused = wV * rs.vectorScore + wS * rs.statScore + wL * rs.llmScore;
    if (fused < minScore) continue;

    const sources = [...rs.sources];
    fusedPairs.push({
      gA: rs.gA,
      cA: rs.cA,
      gB: rs.gB,
      cB: rs.cB,
      score: fused,
      sources,
    });
    if (rs.sources.has("vector")) vectorAlignments += 1;
    if (rs.sources.has("statistical")) statAlignments += 1;
    if (rs.sources.has("llm")) llmAlignments += 1;
  }

  // ── 3. Union-Find ───────────────────────────────────────────────────────────

  const uf = makeUnionFind();

  // Initialize all nodes
  for (let g = 0; g < data.termGroups.length; g += 1) {
    for (let c = 0; c < data.termGroups[g].candidates.length; c += 1) {
      uf.find(nodeKey(g, c));
    }
  }

  for (const fp of fusedPairs) {
    uf.union(nodeKey(fp.gA, fp.cA), nodeKey(fp.gB, fp.cB));
  }

  // ── 4. Group nodes by root ──────────────────────────────────────────────────

  const componentMap = new Map<string, Array<{ g: number; c: number }>>();

  for (let g = 0; g < data.termGroups.length; g += 1) {
    for (let c = 0; c < data.termGroups[g].candidates.length; c += 1) {
      const root = uf.find(nodeKey(g, c));
      const arr = componentMap.get(root) ?? [];
      arr.push({ g, c });
      componentMap.set(root, arr);
    }
  }

  // Build string ID lookup
  const stringIdLookup = new Map<string, number>();
  for (const { groupIndex, candidateIndex, stringId } of data.stringIds) {
    stringIdLookup.set(nodeKey(groupIndex, candidateIndex), stringId);
  }

  // ── 5. Build aligned groups and unaligned ──────────────────────────────────

  const alignedGroups: MergeAlignmentOutput["alignedGroups"] = [];
  const unaligned: MergeAlignmentOutput["unaligned"] = [];

  for (const nodes of componentMap.values()) {
    if (nodes.length < 2) {
      const { g, c } = nodes[0];
      const cand = data.termGroups[g].candidates[c];
      unaligned.push({
        text: cand.text,
        languageId: data.termGroups[g].languageId,
        reason: "no alignment found",
      });
      continue;
    }

    // Compute per-candidate connection degree (for conflict resolution)
    const degreeMap = new Map<string, number>();
    for (const fp of fusedPairs) {
      const kA = nodeKey(fp.gA, fp.cA);
      const kB = nodeKey(fp.gB, fp.cB);
      degreeMap.set(kA, (degreeMap.get(kA) ?? 0) + 1);
      degreeMap.set(kB, (degreeMap.get(kB) ?? 0) + 1);
    }

    // Group nodes by language group index
    const byGroup = new Map<number, Array<{ c: number; degree: number }>>();
    for (const { g, c } of nodes) {
      const k = nodeKey(g, c);
      const arr = byGroup.get(g) ?? [];
      arr.push({ c, degree: degreeMap.get(k) ?? 0 });
      byGroup.set(g, arr);
    }

    const nodeSet = new Set(nodes.map(({ g, c }) => nodeKey(g, c)));
    const internalPairs = fusedPairs.filter(
      (fp) =>
        nodeSet.has(nodeKey(fp.gA, fp.cA)) &&
        nodeSet.has(nodeKey(fp.gB, fp.cB)),
    );

    const avgScore =
      internalPairs.length > 0
        ? internalPairs.reduce((s, p) => s + p.score, 0) / internalPairs.length
        : 0.5;

    const sourcesSet = new Set<AlignSource>();
    for (const fp of internalPairs) {
      for (const s of fp.sources) sourcesSet.add(s);
    }

    const terms: MergeAlignmentOutput["alignedGroups"][number]["terms"] = [];
    for (const [g, arr] of byGroup.entries()) {
      // Keep the candidate with highest degree; push others to unaligned
      const best = arr.reduce((a, b) => (a.degree >= b.degree ? a : b));
      const group = data.termGroups[g];
      const cand = group.candidates[best.c];
      terms.push({
        languageId: group.languageId,
        text: cand.text,
        normalizedText: cand.normalizedText,
        definition: cand.definition,
        subjects: cand.subjects,
        stringId: stringIdLookup.get(nodeKey(g, best.c)) ?? null,
      });

      for (const { c } of arr) {
        if (c === best.c) continue;
        const conflicted = group.candidates[c];
        unaligned.push({
          text: conflicted.text,
          languageId: group.languageId,
          reason: "conflict: lower connectivity",
        });
      }
    }

    alignedGroups.push({
      terms,
      confidence: avgScore,
      alignmentSources: [...sourcesSet],
    });
  }

  const totalInputTerms = data.termGroups.reduce(
    (acc, g) => acc + g.candidates.length,
    0,
  );

  return {
    alignedGroups,
    unaligned,
    stats: {
      totalInputTerms,
      totalAlignedGroups: alignedGroups.length,
      vectorAlignments,
      statisticalAlignments: statAlignments,
      llmAlignments,
    },
  };
};
