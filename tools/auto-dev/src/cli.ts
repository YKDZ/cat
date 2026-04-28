#!/usr/bin/env node

import { runAudit } from "./cli/audit.js";
import { runClaim } from "./cli/claim.js";
import { runConfig } from "./cli/config.js";
import { runDecisions } from "./cli/decisions.js";
import { runHelpRequest } from "./cli/help-request.js";
import { runList } from "./cli/list.js";
import { runPublishSummary } from "./cli/publish-summary.js";
import { runReportPhase } from "./cli/report-phase.js";
import { runRequestDecision } from "./cli/request-decision.js";
import { runRequestValidation } from "./cli/request-validation.js";
import { runResolveDecision } from "./cli/resolve-decision.js";
import { runStart } from "./cli/start.js";
import { runStatus } from "./cli/status.js";
import { runStop } from "./cli/stop.js";
import { runSyncFromIssue } from "./cli/sync-from-issue.js";
import { runSyncToIssue } from "./cli/sync-to-issue.js";

const COMMANDS: Record<string, (args: string[]) => Promise<void>> = {
  start: runStart,
  stop: runStop,
  status: runStatus,
  claim: runClaim,
  "help-request": runHelpRequest,
  "request-decision": runRequestDecision,
  "resolve-decision": runResolveDecision,
  "request-validation": runRequestValidation,
  "report-phase": runReportPhase,
  "publish-summary": runPublishSummary,
  "sync-to-issue": runSyncToIssue,
  "sync-from-issue": runSyncFromIssue,
  audit: runAudit,
  list: runList,
  decisions: runDecisions,
  config: runConfig,
};

const main = async () => {
  const args = process.argv.slice(2);
  const subcommand = args[0];

  if (!subcommand || !COMMANDS[subcommand]) {
    console.error(`Usage: auto-dev <command> [args]`);
    console.error(`Available commands: ${Object.keys(COMMANDS).join(", ")}`);
    process.exit(subcommand ? 1 : 0);
  }

  await COMMANDS[subcommand](args.slice(1));
};

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
