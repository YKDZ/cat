import { createComment } from "../shared/gh-cli.js";

export const runPublishSummary = async (args: string[]): Promise<void> => {
  const issueNumber = parseInt(args[0] ?? "", 10);
  const message = args[1];

  if (!issueNumber || !message) {
    console.error("Usage: auto-dev publish-summary <issue-number> <message>");
    process.exit(1);
  }

  const repo = process.env.GITHUB_REPOSITORY ?? "";
  if (!repo) {
    console.error(
      "[auto-dev] GITHUB_REPOSITORY environment variable is not set",
    );
    process.exit(1);
  }

  createComment(
    repo,
    issueNumber,
    `🤖 **Auto-Dev** Agent Summary\n\n${message}`,
  );
  console.log(JSON.stringify({ issueNumber, message: "Summary published" }));
};
