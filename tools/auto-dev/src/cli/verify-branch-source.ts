import { BranchManager } from "../branch-manager/index.js";

export const runVerifyBranchSource = async (args: string[]): Promise<void> => {
  const issueNumberStr = args[0];
  if (!issueNumberStr) {
    console.error("Usage: auto-dev verify-branch-source <issue-number>");
    process.exit(1);
  }
  const issueNumber = parseInt(issueNumberStr, 10);
  if (isNaN(issueNumber)) {
    console.error(`Invalid issue number: ${issueNumberStr}`);
    process.exit(1);
  }
  const workspaceRoot = process.env.MOON_WORKSPACE_ROOT ?? process.cwd();
  const repo = process.env.GITHUB_REPOSITORY ?? "owner/repo";
  const bm = new BranchManager(workspaceRoot, repo);
  try {
    const result = bm.verifyBranchSource(issueNumber);
    console.log(
      `Branch ${result.branch} verified: from origin/main (merge-base ${result.mergeBase.slice(0, 8)})`,
    );
  } catch (err) {
    console.error(
      `Verification failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
};
