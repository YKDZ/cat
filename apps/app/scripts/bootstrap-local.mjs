import { spawn } from "node:child_process";

import dotenv from "dotenv";

dotenv.config();

const spacyServerUrl = process.env.SPACY_SERVER_URL;
if (!spacyServerUrl) {
  throw new Error(
    "SPACY_SERVER_URL is required to bootstrap local service configuration",
  );
}

process.env.CAT_BOOTSTRAP_PLAN = JSON.stringify({
  idempotencyKey: "local-services-v1",
  operations: [
    {
      pluginId: "spacy-language-analyzer",
      scopeId: "",
      scopeType: "GLOBAL",
      type: "install-if-absent",
      value: { serverUrl: spacyServerUrl },
    },
  ],
  version: "1",
});

const child = spawn(
  process.execPath,
  ["dist/bootstrap-only/bootstrap-only-cli.js"],
  { env: process.env, stdio: "inherit" },
);
child.once("error", (error) => {
  throw error;
});
child.once("exit", (code) => {
  process.exitCode = code ?? 1;
});
