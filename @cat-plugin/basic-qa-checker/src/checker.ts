import type { CheckContext, QAIssue } from "@cat/plugin-core";

import { QAChecker } from "@cat/plugin-core";

import { countTokenValues } from "@/utils/token.ts";

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
          severity: "error",
          message: `译文中缺失数字 "${num}" (原文有 ${count} 个，译文仅有 ${targetCount} 个)`,
          ruleId: "basic.number-consistency.missing",
          ruleFamily: "number",
          defaultAction: "NEEDS_REVIEW",
          confidence: 0.7,
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
          severity: "error",
          message: `译文中存在多余数字 "${num}"`,
          ruleId: "basic.number-consistency.extra",
          ruleFamily: "number",
          targetTokenIndex:
            targetTokenIndex !== -1 ? targetTokenIndex : undefined,
          defaultAction: "NEEDS_REVIEW",
          confidence: 0.7,
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
          severity: "error",
          message: `译文中缺失变量 "${variable}"`,
          ruleId: "basic.variable-consistency.missing",
          ruleFamily: "placeholder",
          defaultAction: "BLOCK_APPROVAL",
          confidence: 1,
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
          severity: "error",
          message: `译文中存在多余变量 "${variable}"`,
          ruleId: "basic.variable-consistency.extra",
          ruleFamily: "placeholder",
          targetTokenIndex:
            targetTokenIndex !== -1 ? targetTokenIndex : undefined,
          defaultAction: "BLOCK_APPROVAL",
          confidence: 1,
        });
      }
    }

    return issues;
  };
}
