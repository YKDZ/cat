import { spawn } from "node:child_process";

import { redactDiagnosticText } from "@cat/shared";

import type { ReleaseImageBuildResult } from "./image-builder.ts";

export type VerificationCommandOptions = {
  cwd: string;
  env: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  stdio?: "inherit" | "pipe";
  terminationGraceMs?: number;
};

export type VerificationCommandResult = { stderr: string; stdout: string };

export type VerificationCommandRunner = (
  command: string,
  args: string[],
  options: VerificationCommandOptions,
) => Promise<VerificationCommandResult>;

export class CommandExecutionError extends Error {
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly stderr: string;
  readonly stdout: string;

  constructor(
    message: string,
    exitCode: number | null,
    signal: string | null,
    stderr = "",
    stdout = "",
  ) {
    const safeMessage = redactDiagnosticText(message);
    const safeStderr = redactDiagnosticText(stderr);
    const safeStdout = redactDiagnosticText(stdout);
    super(
      [
        safeMessage,
        ...(safeStdout === "" ? [] : [`stdout:\n${safeStdout.trimEnd()}`]),
        ...(safeStderr === "" ? [] : [`stderr:\n${safeStderr.trimEnd()}`]),
      ].join("\n"),
    );
    this.name = "CommandExecutionError";
    this.exitCode = exitCode;
    this.signal = signal;
    this.stderr = safeStderr;
    this.stdout = safeStdout;
  }
}

export type ApplicationLifecycleContext = {
  buildId?: string;
  env: NodeJS.ProcessEnv;
  projectName: string;
  report?: (message: string) => void;
  reportError?: (message: string) => void;
  run: VerificationCommandRunner;
  signal: AbortSignal;
};

export type ApplicationLifecycle = (
  context: ApplicationLifecycleContext,
  images: ReleaseImageBuildResult,
) => Promise<unknown>;

const defaultTerminationGraceMs = 3_000;

const signalProcessGroup = (
  child: ReturnType<typeof spawn>,
  signal: NodeJS.Signals,
): void => {
  try {
    if (child.pid !== undefined && process.platform !== "win32") {
      process.kill(-child.pid, signal);
    } else {
      child.kill(signal);
    }
  } catch {
    // The child may have settled between the abort event and the signal.
  }
};

export const runVerificationCommand: VerificationCommandRunner = async (
  command,
  args,
  options,
) =>
  await new Promise((resolveResult, reject) => {
    const capture = options.stdio === "pipe";
    const child = spawn(command, args, {
      cwd: options.cwd,
      detached: process.platform !== "win32",
      env: options.env,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    let stderr = "";
    let stdout = "";
    let forceTermination: NodeJS.Timeout | undefined;
    let aborting = false;
    let escalationCompleted = false;
    let settled = false;
    let closeResult:
      | { code: number | null; signal: NodeJS.Signals | null }
      | undefined;
    const cleanup = (): void => {
      options.signal?.removeEventListener("abort", abort);
      if (forceTermination !== undefined) clearTimeout(forceTermination);
    };
    const settleAfterClose = (): void => {
      if (
        settled ||
        closeResult === undefined ||
        (aborting && !escalationCompleted)
      ) {
        return;
      }
      settled = true;
      cleanup();
      if (closeResult.code === 0 && !aborting) {
        resolveResult({ stderr, stdout });
        return;
      }
      reject(
        new CommandExecutionError(
          `${command} command ${aborting ? "aborted" : "failed"}`,
          closeResult.code,
          closeResult.signal,
          stderr,
          stdout,
        ),
      );
    };
    const abort = (): void => {
      if (aborting || settled) return;
      aborting = true;
      signalProcessGroup(child, "SIGTERM");
      forceTermination = setTimeout(() => {
        signalProcessGroup(child, "SIGKILL");
        escalationCompleted = true;
        settleAfterClose();
      }, options.terminationGraceMs ?? defaultTerminationGraceMs);
    };
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    });
    child.once("close", (code, signal) => {
      closeResult = { code, signal };
      settleAfterClose();
    });
  });
