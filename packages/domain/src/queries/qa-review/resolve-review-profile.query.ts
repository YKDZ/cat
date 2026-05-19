import { and, desc, eq, isNull, or, qaReviewProfile, sql } from "@cat/db";
import {
  QaReviewProfileConfigSchema,
  type QaReviewProfileConfig,
} from "@cat/shared";
import * as z from "zod";

import type { Query } from "@/types";

export const defaultQaReviewProfileConfig = QaReviewProfileConfigSchema.parse({
  enabledLayers: { deterministic: true, semantic: false },
  rules: [
    {
      ruleFamily: "placeholder",
      action: "BLOCK_APPROVAL",
      riskScore: 100,
      minConfidenceBasisPoints: 9000,
    },
    {
      ruleFamily: "number",
      action: "NEEDS_REVIEW",
      riskScore: 65,
      minConfidenceBasisPoints: 0,
    },
  ],
});

export const ResolveQaReviewProfileQuerySchema = z.object({
  projectId: z.uuidv4(),
  languageId: z.string(),
  contentNodeId: z.uuidv4().nullable().optional(),
  branchId: z.int().positive().nullable().optional(),
});

export type ResolveQaReviewProfileQuery = z.infer<
  typeof ResolveQaReviewProfileQuerySchema
>;

export type ResolveQaReviewProfileResult = {
  profileId: number | null;
  config: QaReviewProfileConfig;
};

/**
 * @zh 解析项目/语言/内容节点/分支作用域下最具体的 QA review profile。
 * @en Resolve the most specific QA review profile for the given project/language/content-node/branch scope.
 */
export const resolveQaReviewProfile: Query<
  ResolveQaReviewProfileQuery,
  ResolveQaReviewProfileResult
> = async (ctx, input) => {
  const query = ResolveQaReviewProfileQuerySchema.parse(input);
  const rows = await ctx.db
    .select({
      id: qaReviewProfile.id,
      config: qaReviewProfile.config,
      specificity: sql<number>`
        (CASE WHEN ${qaReviewProfile.languageId} IS NOT NULL THEN 4 ELSE 0 END) +
        (CASE WHEN ${qaReviewProfile.contentNodeId} IS NOT NULL THEN 2 ELSE 0 END) +
        (CASE WHEN ${qaReviewProfile.branchId} IS NOT NULL THEN 1 ELSE 0 END)
      `.as("specificity"),
      isDefault: qaReviewProfile.isDefault,
      updatedAt: qaReviewProfile.updatedAt,
    })
    .from(qaReviewProfile)
    .where(
      and(
        eq(qaReviewProfile.projectId, query.projectId),
        eq(qaReviewProfile.enabled, true),
        or(
          eq(qaReviewProfile.languageId, query.languageId),
          isNull(qaReviewProfile.languageId),
        ),
        query.contentNodeId
          ? or(
              eq(qaReviewProfile.contentNodeId, query.contentNodeId),
              isNull(qaReviewProfile.contentNodeId),
            )
          : isNull(qaReviewProfile.contentNodeId),
        query.branchId
          ? or(
              eq(qaReviewProfile.branchId, query.branchId),
              isNull(qaReviewProfile.branchId),
            )
          : isNull(qaReviewProfile.branchId),
      ),
    )
    .orderBy(
      desc(sql`"specificity"`),
      desc(qaReviewProfile.isDefault),
      desc(qaReviewProfile.updatedAt),
    )
    .limit(1);

  const row = rows[0];
  if (!row) {
    return {
      profileId: null,
      config: defaultQaReviewProfileConfig,
    };
  }

  return {
    profileId: row.id,
    config: QaReviewProfileConfigSchema.parse(row.config),
  };
};
