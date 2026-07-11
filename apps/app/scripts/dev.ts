#!/usr/bin/env node
import { spawn, type ChildProcess } from "node:child_process";
import { readdirSync, watch, type FSWatcher } from "node:fs";
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

type PluginBuildState = {
  dirty: boolean;
  running: boolean;
  timer: NodeJS.Timeout | undefined;
};

export type PluginBuildWatcher = {
  close: () => Promise<void>;
};

export type PluginBuildWatcherOptions = {
  debounceMs?: number;
  onError?: (pluginName: string, error: unknown) => void;
  pluginRoot?: string;
};

export const watchPluginBuilds = (
  onBuild: (pluginName: string) => Promise<void>,
  options: PluginBuildWatcherOptions = {},
): PluginBuildWatcher => {
  const pluginRoot =
    options.pluginRoot ??
    process.env.CAT_PLUGIN_ROOT ??
    resolve(import.meta.dirname, "../../../@cat-plugin");
  const debounceMs =
    options.debounceMs ?? Number(process.env.CAT_PLUGIN_DEBOUNCE_MS ?? 75);
  const states = new Map<string, PluginBuildState>();
  const pending = new Set<Promise<void>>();
  const watchers: FSWatcher[] = [];
  let closed = false;

  const runBuild = (pluginName: string): void => {
    const state = states.get(pluginName);
    if (closed || state === undefined || state.running || !state.dirty) return;

    state.dirty = false;
    state.running = true;
    const build = onBuild(pluginName)
      .catch((error: unknown) => {
        options.onError?.(pluginName, error);
      })
      .finally(() => {
        state.running = false;
        pending.delete(build);
        if (state.dirty && !closed) runBuild(pluginName);
      });
    pending.add(build);
  };

  const scheduleBuild = (pluginName: string): void => {
    if (closed) return;
    const state = states.get(pluginName);
    if (state === undefined) return;
    state.dirty = true;
    if (state.timer !== undefined) clearTimeout(state.timer);
    state.timer = setTimeout(() => {
      state.timer = undefined;
      runBuild(pluginName);
    }, debounceMs);
  };

  for (const entry of readdirSync(pluginRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const sourceRoot = resolve(pluginRoot, entry.name, "src");
    states.set(entry.name, { dirty: false, running: false, timer: undefined });
    try {
      watchers.push(
        watch(sourceRoot, { recursive: true }, (_event, filename) => {
          const path = filename?.toString();
          if (path !== undefined && !/\.(?:spec|test)\./.test(path)) {
            scheduleBuild(entry.name);
          }
        }),
      );
    } catch {
      states.delete(entry.name);
    }
  }

  return {
    close: async (): Promise<void> => {
      closed = true;
      for (const watcher of watchers) watcher.close();
      for (const state of states.values()) {
        if (state.timer !== undefined) clearTimeout(state.timer);
        state.dirty = false;
      }
      await Promise.allSettled([...pending]);
    },
  };
};

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
  let pluginBuilds: PluginBuildWatcher | undefined;
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

    pluginBuilds = watchPluginBuilds(
      async (pluginName) => {
        const build = track(
          spawn("pnpm", ["--filter", `@cat-plugin/${pluginName}`, "build"], {
            cwd: repositoryRoot,
            stdio: "inherit",
          }),
        );
        const result = await waitForChild(build);
        if (result.code !== 0) {
          throw new Error(
            `Plugin ${pluginName} build failed (${result.code ?? result.signal})`,
          );
        }
      },
      {
        onError: (pluginName, error) => {
          // oxlint-disable-next-line no-console
          console.error(`Plugin ${pluginName} build failed`, error);
        },
      },
    );

    const vike = track(
      spawn("pnpm", ["exec", "vike", "dev", ...vikeArgs], {
        cwd: resolve(repositoryRoot, "apps/app"),
        stdio: ["inherit", "pipe", "inherit"],
      }),
    );
    prettyStream = pinoPretty();
    vike.stdout?.pipe(prettyStream);
    const result = await waitForChild(vike);
    return requestedSignal === null
      ? result
      : { code: null, signal: requestedSignal };
  } finally {
    terminateChildren(requestedSignal ?? "SIGTERM");
    await pluginBuilds?.close();
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
