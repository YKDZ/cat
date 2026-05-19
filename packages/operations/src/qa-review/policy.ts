import type { NormalizedQaFinding, QaReviewProfileConfig } from "@cat/shared";

export const applyQaReviewPolicy = (input: {
  findings: NormalizedQaFinding[];
  profile: QaReviewProfileConfig;
}): NormalizedQaFinding[] => {
  return input.findings.map((finding) => {
    const matchedRule = input.profile.rules.find(
      (rule) =>
        (rule.ruleId && rule.ruleId === finding.ruleId) ||
        (rule.ruleFamily && rule.ruleFamily === finding.ruleFamily) ||
        (rule.checkerId && rule.checkerId === String(finding.checkerServiceId)),
    );

    if (!matchedRule) return finding;

    if (finding.confidenceBasisPoints < matchedRule.minConfidenceBasisPoints) {
      return {
        ...finding,
        action: "INFORMATIONAL",
        riskScore: Math.min(finding.riskScore, 20),
      };
    }

    return {
      ...finding,
      action: matchedRule.action,
      riskScore: matchedRule.riskScore,
    };
  });
};
