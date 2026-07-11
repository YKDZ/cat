import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import {
  appendFile,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ProcessResult = {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
};

const devScript = resolve(import.meta.dirname, "dev.ts");

let fixtureDirectory: string;

const runDev = (
  args: string[],
  env: NodeJS.ProcessEnv,
): {
  child: ReturnType<typeof spawn>;
  result: Promise<ProcessResult>;
} => {
  const child = spawn(process.execPath, [devScript, ...args], {
    cwd: resolve(import.meta.dirname, ".."),
    env: {
      ...env,
      CAT_PLUGIN_DEBOUNCE_MS: "30",
      CAT_PLUGIN_ROOT: join(fixtureDirectory, "plugins"),
      CAT_REPOSITORY_ROOT: fixtureDirectory,
      FAKE_INITIAL_BUILD_FILE: join(fixtureDirectory, "initial-build.txt"),
      FAKE_PLUGIN_BUILD_LOG: join(fixtureDirectory, "plugin-builds.log"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  const result = new Promise<ProcessResult>((resolveResult, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Development runner timed out: ${stderr}`));
    }, 5_000);

    child.once("error", reject);
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      resolveResult({ code, signal, stdout, stderr });
    });
  });

  return { child, result };
};

const waitForFile = async (path: string): Promise<void> => {
  await vi.waitFor(
    () => {
      expect(existsSync(path)).toBe(true);
    },
    {
      interval: 20,
      timeout: 2_000,
    },
  );
};

beforeEach(async () => {
  fixtureDirectory = await mkdtemp(join(tmpdir(), "cat-dev-runner-"));
  await mkdir(join(fixtureDirectory, "apps/app"), { recursive: true });
  await mkdir(join(fixtureDirectory, "plugins/example/src"), {
    recursive: true,
  });
  await writeFile(
    join(fixtureDirectory, "plugins/example/src/index.ts"),
    "export const value = 1;\n",
  );
  const fakePnpm = join(fixtureDirectory, "pnpm");
  await writeFile(
    fakePnpm,
    `#!/usr/bin/env node
const { appendFileSync, writeFileSync } = require("node:fs");

const args = process.argv.slice(2);
if (args[0] === "build-plugins") {
  if (process.env.FAKE_INITIAL_BUILD_MODE === "fail") process.exit(19);
  writeFileSync(process.env.FAKE_INITIAL_BUILD_FILE, "built");
  process.exit(0);
}

if (args[0] === "exec" && args[1] === "vike") {
  if (!require("node:fs").existsSync(process.env.FAKE_INITIAL_BUILD_FILE)) {
    process.exit(91);
  }
  writeFileSync(process.env.FAKE_VIKE_ARGS_FILE, JSON.stringify(args.slice(2)));
  process.stdout.write(JSON.stringify({ level: 30, time: Date.now(), msg: "fake vike started" }) + "\\n");

  if (process.env.FAKE_VIKE_MODE === "fail") {
    process.exit(Number(process.env.FAKE_VIKE_EXIT_CODE));
  }

  if (process.env.FAKE_VIKE_MODE === "hang") {
    process.on("SIGTERM", () => {
      writeFileSync(process.env.FAKE_VIKE_CLEANUP_FILE, "cleaned");
      process.exit(0);
    });
    setInterval(() => {}, 1_000);
  }
  return;
}

appendFileSync(process.env.FAKE_PLUGIN_BUILD_LOG, JSON.stringify(args) + "\\n");
if (process.env.FAKE_PLUGIN_BUILD_MODE === "fail") process.exit(29);
if (process.env.FAKE_PLUGIN_BUILD_MODE === "hang") {
  process.on("SIGTERM", () => {
    writeFileSync(process.env.FAKE_PLUGIN_BUILD_CLEANUP_FILE, "cleaned");
    process.exit(0);
  });
  setInterval(() => {}, 1_000);
} else {
  setTimeout(() => process.exit(0), Number(process.env.FAKE_PLUGIN_BUILD_DELAY ?? 0));
}
`,
    "utf8",
  );
  await chmod(fakePnpm, 0o755);
  const fakeVike = join(fixtureDirectory, "vike");
  await writeFile(
    fakeVike,
    `#!/usr/bin/env node
const { writeFileSync } = require("node:fs");

if (!require("node:fs").existsSync(process.env.FAKE_INITIAL_BUILD_FILE)) {
  process.exit(91);
}
writeFileSync(process.env.FAKE_VIKE_ARGS_FILE, JSON.stringify(process.argv.slice(2)));
process.stdout.write(JSON.stringify({ level: 30, time: Date.now(), msg: "fake vike started" }) + "\\n");

if (process.env.FAKE_VIKE_MODE === "fail") {
  process.exit(Number(process.env.FAKE_VIKE_EXIT_CODE));
}

if (process.env.FAKE_VIKE_MODE === "hang") {
  process.on("SIGTERM", () => {
    writeFileSync(process.env.FAKE_VIKE_CLEANUP_FILE, "cleaned");
    process.exit(0);
  });
  setInterval(() => {}, 1_000);
}
`,
    "utf8",
  );
  await chmod(fakeVike, 0o755);
});

afterEach(async () => {
  await rm(fixtureDirectory, { recursive: true, force: true });
});

describe("development runner", () => {
  it("forwards every CLI argument to Vike and preserves pretty logging", async () => {
    const argsFile = join(fixtureDirectory, "args.json");
    const { result } = runDev(
      ["--", "--host", "127.0.0.1", "--port", "4317", "--strictPort"],
      {
        ...process.env,
        PATH: `${fixtureDirectory}${delimiter}${process.env.PATH ?? ""}`,
        FAKE_VIKE_ARGS_FILE: argsFile,
        FAKE_VIKE_MODE: "success",
      },
    );

    await expect(result).resolves.toMatchObject({ code: 0, signal: null });
    await expect(readFile(argsFile, "utf8")).resolves.toBe(
      JSON.stringify([
        "dev",
        "--host",
        "127.0.0.1",
        "--port",
        "4317",
        "--strictPort",
      ]),
    );
    expect((await result).stdout).toContain("fake vike started");
  });

  it("returns Vike's failure status", async () => {
    const { result } = runDev([], {
      ...process.env,
      PATH: `${fixtureDirectory}${delimiter}${process.env.PATH ?? ""}`,
      FAKE_VIKE_ARGS_FILE: join(fixtureDirectory, "args.json"),
      FAKE_VIKE_EXIT_CODE: "23",
      FAKE_VIKE_MODE: "fail",
    });

    await expect(result).resolves.toMatchObject({ code: 23, signal: null });
  });

  it("forwards termination signals and waits for Vike cleanup", async () => {
    const argsFile = join(fixtureDirectory, "args.json");
    const cleanupFile = join(fixtureDirectory, "cleanup.txt");
    const { child, result } = runDev([], {
      ...process.env,
      PATH: `${fixtureDirectory}${delimiter}${process.env.PATH ?? ""}`,
      FAKE_VIKE_ARGS_FILE: argsFile,
      FAKE_VIKE_CLEANUP_FILE: cleanupFile,
      FAKE_VIKE_MODE: "hang",
    });

    await waitForFile(argsFile);
    child.kill("SIGTERM");

    await expect(result).resolves.toMatchObject({
      code: null,
      signal: "SIGTERM",
    });
    await vi.waitFor(
      async () => {
        await expect(readFile(cleanupFile, "utf8")).resolves.toBe("cleaned");
      },
      { interval: 20, timeout: 1_000 },
    );
  });

  it("debounces changes and queues a follow-up build for changes during a build", async () => {
    const argsFile = join(fixtureDirectory, "args.json");
    const buildLog = join(fixtureDirectory, "plugin-builds.log");
    const source = join(fixtureDirectory, "plugins/example/src/index.ts");
    const { child, result } = runDev([], {
      ...process.env,
      PATH: `${fixtureDirectory}${delimiter}${process.env.PATH ?? ""}`,
      FAKE_PLUGIN_BUILD_DELAY: "250",
      FAKE_VIKE_ARGS_FILE: argsFile,
      FAKE_VIKE_CLEANUP_FILE: join(fixtureDirectory, "cleanup.txt"),
      FAKE_VIKE_MODE: "hang",
    });

    await waitForFile(argsFile);
    await Promise.all([
      appendFile(source, "// first\n"),
      appendFile(source, "// debounced\n"),
    ]);
    await vi.waitFor(
      async () => {
        expect(
          (await readFile(buildLog, "utf8")).trim().split("\n"),
        ).toHaveLength(1);
      },
      { interval: 20, timeout: 2_000 },
    );
    await appendFile(source, "// queued\n");
    await vi.waitFor(
      async () => {
        expect(
          (await readFile(buildLog, "utf8")).trim().split("\n"),
        ).toHaveLength(2);
      },
      { interval: 20, timeout: 2_000 },
    );

    child.kill("SIGTERM");
    await expect(result).resolves.toMatchObject({ signal: "SIGTERM" });
  });

  it("reports plugin build failures without stopping Vike", async () => {
    const argsFile = join(fixtureDirectory, "args.json");
    const source = join(fixtureDirectory, "plugins/example/src/index.ts");
    const { child, result } = runDev([], {
      ...process.env,
      PATH: `${fixtureDirectory}${delimiter}${process.env.PATH ?? ""}`,
      FAKE_PLUGIN_BUILD_MODE: "fail",
      FAKE_VIKE_ARGS_FILE: argsFile,
      FAKE_VIKE_CLEANUP_FILE: join(fixtureDirectory, "cleanup.txt"),
      FAKE_VIKE_MODE: "hang",
    });

    await waitForFile(argsFile);
    await appendFile(source, "// fail\n");
    await vi.waitFor(
      async () => {
        expect(
          await readFile(join(fixtureDirectory, "plugin-builds.log"), "utf8"),
        ).toContain("@cat-plugin/example");
      },
      { interval: 20, timeout: 2_000 },
    );
    expect(child.exitCode).toBeNull();
    child.kill("SIGTERM");
    const output = await result;
    expect(output.signal).toBe("SIGTERM");
    expect(output.stderr).toContain("Plugin example build failed");
  });

  it("terminates an active plugin build during shutdown", async () => {
    const argsFile = join(fixtureDirectory, "args.json");
    const buildCleanup = join(fixtureDirectory, "build-cleanup.txt");
    const source = join(fixtureDirectory, "plugins/example/src/index.ts");
    const { child, result } = runDev([], {
      ...process.env,
      PATH: `${fixtureDirectory}${delimiter}${process.env.PATH ?? ""}`,
      FAKE_PLUGIN_BUILD_CLEANUP_FILE: buildCleanup,
      FAKE_PLUGIN_BUILD_MODE: "hang",
      FAKE_VIKE_ARGS_FILE: argsFile,
      FAKE_VIKE_CLEANUP_FILE: join(fixtureDirectory, "cleanup.txt"),
      FAKE_VIKE_MODE: "hang",
    });

    await waitForFile(argsFile);
    await appendFile(source, "// hang\n");
    await waitForFile(join(fixtureDirectory, "plugin-builds.log"));
    child.kill("SIGTERM");

    await expect(result).resolves.toMatchObject({ signal: "SIGTERM" });
    await expect(readFile(buildCleanup, "utf8")).resolves.toBe("cleaned");
  });
});
