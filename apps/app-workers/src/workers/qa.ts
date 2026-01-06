import { defineWorkflow } from "@/core";
import { getDrizzleDB, getRedisDB } from "@cat/db";
import {
  PluginRegistry,
  QAChecker,
  QAIssueSchema,
  TokenSchema,
  type CheckContext,
  type QAIssue,
  type Token,
} from "@cat/plugin-core";
import z from "zod";
import { searchTermTask } from "./search-term";

export const QAInputSchema = z.object({
  source: z.object({
    languageId: z.string(),
    text: z.string(),
    tokens: z.array(TokenSchema),
  }),
  translation: z.object({
    languageId: z.string(),
    text: z.string(),
    tokens: z.array(TokenSchema),
  }),
  glossaryIds: z.array(z.uuidv4()),
  pub: z.boolean().default(false).optional(),
});

export const QAOutputSchema = z.object({
  issues: z.array(QAIssueSchema),
});

export const QAWorkflow = await defineWorkflow({
  name: "qa",
  input: QAInputSchema,
  output: QAOutputSchema,

  dependencies: (payload, { traceId }) => [
    searchTermTask.asChild(
      {
        text: payload.source.text,
        sourceLanguageId: payload.source.languageId,
        translationLanguageId: payload.translation.languageId,
        glossaryIds: payload.glossaryIds,
      },
      { traceId },
    ),
  ],

  handler: async (payload, { traceId, getTaskResult }) => {
    const { client: drizzle } = await getDrizzleDB();
    const { redisPub } = await getRedisDB();
    const pluginRegistry = PluginRegistry.get("GLOBAL", "");

    const [termResult] = getTaskResult(searchTermTask);
    const terms = termResult?.terms ?? [];

    const { source, translation, pub } = payload;

    const ctx = {
      source: {
        ...source,
        flatTokens: flattenTokens(source.tokens),
      },
      translation: {
        ...translation,
        flatTokens: flattenTokens(translation.tokens),
      },
      terms,
    } satisfies CheckContext;

    const checkers: { checker: QAChecker; id: number }[] = await Promise.all(
      pluginRegistry
        .getPluginServices("QA_CHECKER")
        .map(async ({ record, service }) => {
          const id = await pluginRegistry.getPluginServiceDbId(
            drizzle,
            record.pluginId,
            record.type,
            record.id,
          );
          return {
            checker: service,
            id,
          };
        }),
    );

    checkers.push(
      ...[
        { id: -1, checker: new NumberConsistencyChecker() },
        { id: -2, checker: new VariableConsistencyChecker() },
      ],
    );

    const issues: QAIssue[] = [];

    await Promise.all(
      checkers.map(async (checker) => {
        const issue = await checker.checker.check(ctx);
        issues.push(...issue);

        if (pub)
          await redisPub.publish(`qa:issue:${traceId}`, JSON.stringify(issue));
      }),
    );

    return { issues };
  },
});

const flattenTokens = (tokens: Token[]): Token[] => {
  const result: Token[] = [];

  const traverse = (nodes: Token[]) => {
    for (const node of nodes) {
      result.push(node);
      if (node.children && node.children.length > 0) {
        traverse(node.children);
      }
    }
  };
  traverse(tokens);

  return result;
};

const countTokenValues = (
  tokens: Token[],
  typeFilter: string,
): Map<string, number> => {
  const map = new Map<string, number>();
  tokens.forEach((t) => {
    if (t.type === typeFilter) {
      map.set(t.value, (map.get(t.value) || 0) + 1);
    }
  });
  return map;
};

export class NumberConsistencyChecker extends QAChecker {
  getId = (): string => "number-consistency-checker";

  check = (ctx: CheckContext): QAIssue[] => {
    const issues: QAIssue[] = [];

    // 统计原文和译文中的数字出现频率
    const sourceCounts = countTokenValues(ctx.source.flatTokens, "number");
    const targetCounts = countTokenValues(ctx.translation.flatTokens, "number");

    // 检查是否有缺失的数字
    for (const [num, count] of sourceCounts) {
      const targetCount = targetCounts.get(num) || 0;
      if (targetCount < count) {
        issues.push({
          ruleId: 1001, // 假设 ID
          severity: "error",
          message: `译文中缺失数字 "${num}" (原文有 ${count} 个，译文仅有 ${targetCount} 个)`,
        });
      }
    }

    // 检查是否有多余的数字
    for (const [num, count] of targetCounts) {
      const sourceCount = sourceCounts.get(num) || 0;
      if (count > sourceCount) {
        // 尝试找到多余数字在译文中的位置（取最后一个匹配项作为示例）
        const targetTokenIndex = ctx.translation.flatTokens.findIndex(
          (t) => t.type === "number" && t.value === num,
        );

        issues.push({
          ruleId: 1001,
          severity: "error",
          message: `译文中存在多余数字 "${num}"`,
          targetTokenIndex:
            targetTokenIndex !== -1 ? targetTokenIndex : undefined,
        });
      }
    }

    return issues;
  };
}

export class VariableConsistencyChecker extends QAChecker {
  getId = (): string => "variable-consistency-checker";

  check = (ctx: CheckContext): QAIssue[] => {
    const issues: QAIssue[] = [];

    // 统计原文和译文中的变量出现频率
    const sourceCounts = countTokenValues(ctx.source.flatTokens, "variable");
    const targetCounts = countTokenValues(
      ctx.translation.flatTokens,
      "variable",
    );

    // 检查是否有缺失的变量
    for (const [variable, count] of sourceCounts) {
      const targetCount = targetCounts.get(variable) || 0;
      if (targetCount < count) {
        issues.push({
          ruleId: 2001, // 假设 ID
          severity: "error",
          message: `译文中缺失变量 "${variable}"`,
        });
      }
    }

    // 检查是否有多余的变量
    for (const [variable, count] of targetCounts) {
      const sourceCount = sourceCounts.get(variable) || 0;
      if (count > sourceCount) {
        // 尝试找到多余变量在译文中的位置
        const targetTokenIndex = ctx.translation.flatTokens.findIndex(
          (t) => t.type === "variable" && t.value === variable,
        );

        issues.push({
          ruleId: 2001,
          severity: "error",
          message: `译文中存在多余变量 "${variable}"`,
          targetTokenIndex:
            targetTokenIndex !== -1 ? targetTokenIndex : undefined,
        });
      }
    }

    return issues;
  };
}
