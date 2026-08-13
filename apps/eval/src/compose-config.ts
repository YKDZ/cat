import { existsSync } from "node:fs";
import { resolve } from "node:path";

const SAFE_SUITE_NAME = /^[a-zA-Z0-9_-]+$/;

export type ComposeConfig = {
  composeArgs: string[];
  composeCwd: string;
};

export const resolveComposeConfig = (
  suiteName: string | undefined,
  hasSuiteCompose: (path: string) => boolean = existsSync,
): ComposeConfig => {
  const evalRoot = resolve(import.meta.dirname, "..");

  if (!suiteName) {
    return { composeArgs: [], composeCwd: evalRoot };
  }

  if (!SAFE_SUITE_NAME.test(suiteName)) {
    throw new Error(
      `Invalid suite name: "${suiteName}" - must match ${SAFE_SUITE_NAME}`,
    );
  }

  const suiteDir = resolve(evalRoot, "suites", suiteName);
  const suiteCompose = resolve(suiteDir, "compose.eval.yaml");

  if (!hasSuiteCompose(suiteCompose)) {
    return {
      composeArgs: ["-p", `eval-${suiteName}`],
      composeCwd: evalRoot,
    };
  }

  return {
    composeArgs: ["-f", suiteCompose, "-p", `eval-${suiteName}`],
    composeCwd: suiteDir,
  };
};
