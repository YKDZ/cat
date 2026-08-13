import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runVerificationCommand } from "./verification-runtime.ts";

describe("verification command runner", () => {
  it("settles a normal command without waiting for termination grace", async () => {
    const result = runVerificationCommand(
      process.execPath,
      ["-e", "process.stdout.write('complete')"],
      {
        cwd: process.cwd(),
        env: process.env,
        stdio: "pipe",
        terminationGraceMs: 10_000,
      },
    );

    await expect(
      Promise.race([
        result,
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("normal command settled slowly")),
            500,
          ),
        ),
      ]),
    ).resolves.toMatchObject({ stdout: "complete" });
  });

  it("force-stops a process group that ignores TERM before resolving abort", async () => {
    const controller = new AbortController();
    const running = runVerificationCommand(
      process.execPath,
      ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1_000)"],
      {
        cwd: process.cwd(),
        env: process.env,
        signal: controller.signal,
        stdio: "pipe",
        terminationGraceMs: 10,
      },
    );

    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    const abortedAt = performance.now();
    controller.abort();
    await expect(running).rejects.toThrow("command aborted");
    expect(performance.now() - abortedAt).toBeGreaterThanOrEqual(5);
  });

  it.skipIf(process.platform === "win32")(
    "waits for group escalation when the leader exits but a descendant ignores TERM",
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "cat-process-group-"));
      const pidFile = join(directory, "processes.json");
      const controller = new AbortController();
      let processGroupId: number | undefined;
      const leader = `
        const { spawn } = require("node:child_process");
        const { writeFileSync } = require("node:fs");
        const descendant = spawn(process.execPath, ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], { stdio: "ignore" });
        writeFileSync(${JSON.stringify(pidFile)}, JSON.stringify({ descendantPid: descendant.pid, processGroupId: process.pid }));
        process.on("SIGTERM", () => process.exit(0));
        setInterval(() => {}, 1000);
      `;
      try {
        const running = runVerificationCommand(
          process.execPath,
          ["-e", leader],
          {
            cwd: process.cwd(),
            env: process.env,
            signal: controller.signal,
            stdio: "pipe",
            terminationGraceMs: 100,
          },
        );
        await expect
          .poll(async () => JSON.parse(await readFile(pidFile, "utf8")))
          .toMatchObject({
            descendantPid: expect.any(Number),
            processGroupId: expect.any(Number),
          });
        const processes = JSON.parse(await readFile(pidFile, "utf8")) as {
          descendantPid: number;
          processGroupId: number;
        };
        processGroupId = processes.processGroupId;
        let settled = false;
        void running.then(
          () => {
            settled = true;
          },
          () => {
            settled = true;
          },
        );

        controller.abort();
        await new Promise<void>((resolve) => setTimeout(resolve, 30));
        expect(settled).toBe(false);
        await expect(running).rejects.toThrow("command aborted");
        await expect
          .poll(() => {
            try {
              process.kill(processes.descendantPid, 0);
              return true;
            } catch {
              return false;
            }
          })
          .toBe(false);
      } finally {
        if (processGroupId !== undefined) {
          try {
            process.kill(-processGroupId, "SIGKILL");
          } catch {
            // The runner already removed the complete process group.
          }
        }
        await rm(directory, { force: true, recursive: true });
      }
    },
  );
});
