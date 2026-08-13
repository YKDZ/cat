#!/usr/bin/env node
import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";

import pinoPretty from "pino-pretty";

export type DevelopmentResult = {
  code: number | null;
  signal: NodeJS.Signals | null;
};

const forwardedSignals: NodeJS.Signals[] = ["SIGHUP", "SIGINT", "SIGTERM"];
const localDatabaseHosts = new Set([
  "::1",
  "127.0.0.1",
  "172.17.0.1",
  "localhost",
  "postgresql",
]);

const waitForChild = async (child: ChildProcess): Promise<DevelopmentResult> =>
  new Promise<DevelopmentResult>((resolveResult, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      resolveResult({ code, signal });
    });
  });

const loadDevelopmentEnvironment = (repositoryRoot: string): void => {
  if (process.env.DATABASE_URL !== undefined) return;
  for (const path of [
    resolve(repositoryRoot, "apps/app/.env"),
    resolve(repositoryRoot, "packages/db/.env"),
  ]) {
    try {
      process.loadEnvFile(path);
      if (process.env.DATABASE_URL !== undefined) return;
    } catch {
      // Missing local env files are reported by Drizzle with its normal error.
    }
  }
};

const assertDevelopmentDatabaseTarget = (): void => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to push the database from a production process");
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined) return;

  const hostname = new URL(databaseUrl).hostname;
  if (
    !localDatabaseHosts.has(hostname) &&
    process.env.CAT_DEV_DB_PUSH_ALLOW_REMOTE !== "true"
  ) {
    throw new Error(
      `Refusing to push remote development database ${hostname}; set CAT_DEV_DB_PUSH_ALLOW_REMOTE=true to allow it`,
    );
  }
};

export const runDevelopment = async (
  args: string[],
): Promise<DevelopmentResult> => {
  const repositoryRoot =
    process.env.CAT_REPOSITORY_ROOT ?? resolve(import.meta.dirname, "../../..");
  const children = new Set<ChildProcess>();
  const signalHandlers = new Map<NodeJS.Signals, () => void>();
  let requestedSignal: NodeJS.Signals | null = null;
  let prettyStream: ReturnType<typeof pinoPretty> | undefined;
  const vikeArgs = args[0] === "--" ? args.slice(1) : args;

  const track = (child: ChildProcess): ChildProcess => {
    children.add(child);
    child.once("close", () => {
      children.delete(child);
    });
    return child;
  };
  const terminateChildren = (signal: NodeJS.Signals): void => {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null)
        child.kill(signal);
    }
  };

  for (const signal of forwardedSignals) {
    const handler = () => {
      requestedSignal ??= signal;
      terminateChildren(signal);
    };
    signalHandlers.set(signal, handler);
    process.on(signal, handler);
  }

  try {
    if (process.env.CAT_DEV_DB_PUSH !== "false") {
      loadDevelopmentEnvironment(repositoryRoot);
      assertDevelopmentDatabaseTarget();
      const databasePush = track(
        spawn("pnpm", ["--filter", "@cat/db", "drizzle:push"], {
          cwd: repositoryRoot,
          stdio: "inherit",
        }),
      );
      const databasePushResult = await waitForChild(databasePush);
      if (requestedSignal !== null) {
        return { code: null, signal: requestedSignal };
      }
      if (databasePushResult.code !== 0) return databasePushResult;
    }

    const initialBuild = track(
      spawn("pnpm", ["build-plugins"], {
        cwd: repositoryRoot,
        stdio: "inherit",
      }),
    );
    const initialResult = await waitForChild(initialBuild);
    if (requestedSignal !== null) {
      return { code: null, signal: requestedSignal };
    }
    if (initialResult.code !== 0) return initialResult;

    const vike = track(
      spawn("pnpm", ["exec", "vike", "dev", ...vikeArgs], {
        cwd: resolve(repositoryRoot, "apps/app"),
        stdio: ["inherit", "pipe", "inherit"],
      }),
    );
    if (process.env.CAT_DIAGNOSTIC_NDJSON === "true") {
      // Execution cells consume server diagnostics as NDJSON. Do not pretty
      // print this stream because that destroys the machine-readable event.
      vike.stdout?.pipe(process.stdout, { end: false });
    } else {
      prettyStream = pinoPretty();
      vike.stdout?.pipe(prettyStream);
    }
    const result = await waitForChild(vike);
    return requestedSignal === null
      ? result
      : { code: null, signal: requestedSignal };
  } finally {
    terminateChildren(requestedSignal ?? "SIGTERM");
    for (const [signal, handler] of signalHandlers) {
      process.off(signal, handler);
    }
    prettyStream?.end();
  }
};

const isDirectExecution =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(import.meta.filename);

if (isDirectExecution) {
  try {
    const result = await runDevelopment(process.argv.slice(2));
    if (result.signal === null) {
      process.exitCode = result.code ?? 1;
    } else {
      process.kill(process.pid, result.signal);
    }
  } catch (error) {
    // oxlint-disable-next-line no-console
    console.error("Failed to run development server", error);
    process.exitCode = 1;
  }
}
