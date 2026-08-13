import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import {
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
      CAT_REPOSITORY_ROOT: fixtureDirectory,
      FAKE_DB_CAPABILITIES_FILE: join(
        fixtureDirectory,
        "database-capabilities.txt",
      ),
      FAKE_DB_PUSH_FILE: join(fixtureDirectory, "database-push.txt"),
      FAKE_VECTOR_RUNTIME_SCHEMA_FILE: join(
        fixtureDirectory,
        "vector-runtime-schema.txt",
      ),
      FAKE_INITIAL_BUILD_FILE: join(fixtureDirectory, "initial-build.txt"),
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
  const fakePnpm = join(fixtureDirectory, "pnpm");
  await writeFile(
    fakePnpm,
    `#!/usr/bin/env node
const { writeFileSync } = require("node:fs");

const args = process.argv.slice(2);
if (args[0] === "--filter" && args[1] === "@cat/db" && args[2] === "drizzle:push") {
  if (process.env.FAKE_DB_CAPABILITIES_MODE === "fail") process.exit(16);
  writeFileSync(process.env.FAKE_DB_CAPABILITIES_FILE, "prepared");
  if (process.env.FAKE_DB_PUSH_MODE === "fail") process.exit(17);
  writeFileSync(process.env.FAKE_DB_PUSH_FILE, "pushed");
  if (process.env.FAKE_VECTOR_RUNTIME_SCHEMA_MODE === "fail") process.exit(18);
  writeFileSync(process.env.FAKE_VECTOR_RUNTIME_SCHEMA_FILE, "prepared");
  process.exit(0);
}

if (args[0] === "build-plugins") {
  if (process.env.FAKE_EXPECT_DB_PUSH !== "false" && !require("node:fs").existsSync(process.env.FAKE_DB_PUSH_FILE)) {
    process.exit(92);
  }
  if (process.env.FAKE_INITIAL_BUILD_MODE === "fail") process.exit(19);
  writeFileSync(process.env.FAKE_INITIAL_BUILD_FILE, "built");
  process.exit(0);
}

if (args[0] === "exec" && args[1] === "vike") {
  if (!require("node:fs").existsSync(process.env.FAKE_INITIAL_BUILD_FILE)) {
    process.exit(91);
  }
  if (process.env.FAKE_VIKE_MODE === "hang") {
    process.on("SIGTERM", () => {
      writeFileSync(process.env.FAKE_VIKE_CLEANUP_FILE, "cleaned");
      process.exit(0);
    });
  }

  writeFileSync(process.env.FAKE_VIKE_ARGS_FILE, JSON.stringify(args.slice(2)));
  process.stdout.write(JSON.stringify({ level: 30, time: Date.now(), msg: "fake vike started" }) + "\\n");

  if (process.env.FAKE_VIKE_MODE === "fail") {
    process.exit(Number(process.env.FAKE_VIKE_EXIT_CODE));
  }

  if (process.env.FAKE_VIKE_MODE === "hang") {
    setInterval(() => {}, 1_000);
  }
  return;
}

process.exit(93);
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
if (process.env.FAKE_VIKE_MODE === "hang") {
  process.on("SIGTERM", () => {
    writeFileSync(process.env.FAKE_VIKE_CLEANUP_FILE, "cleaned");
    process.exit(0);
  });
}

writeFileSync(process.env.FAKE_VIKE_ARGS_FILE, JSON.stringify(process.argv.slice(2)));
process.stdout.write(JSON.stringify({ level: 30, time: Date.now(), msg: "fake vike started" }) + "\\n");

if (process.env.FAKE_VIKE_MODE === "fail") {
  process.exit(Number(process.env.FAKE_VIKE_EXIT_CODE));
}

if (process.env.FAKE_VIKE_MODE === "hang") {
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
  it("prepares database capabilities and pushes the schema before building plugins", async () => {
    const argsFile = join(fixtureDirectory, "args.json");
    const { result } = runDev([], {
      ...process.env,
      PATH: `${fixtureDirectory}${delimiter}${process.env.PATH ?? ""}`,
      FAKE_VIKE_ARGS_FILE: argsFile,
      FAKE_VIKE_MODE: "success",
    });

    await expect(result).resolves.toMatchObject({ code: 0, signal: null });
    await expect(
      readFile(join(fixtureDirectory, "database-capabilities.txt"), "utf8"),
    ).resolves.toBe("prepared");
    await expect(
      readFile(join(fixtureDirectory, "database-push.txt"), "utf8"),
    ).resolves.toBe("pushed");
    await expect(
      readFile(join(fixtureDirectory, "vector-runtime-schema.txt"), "utf8"),
    ).resolves.toBe("prepared");
    await expect(
      readFile(join(fixtureDirectory, "initial-build.txt"), "utf8"),
    ).resolves.toBe("built");
  });

  it("stops before schema push when database capability preparation fails", async () => {
    const { result } = runDev([], {
      ...process.env,
      PATH: `${fixtureDirectory}${delimiter}${process.env.PATH ?? ""}`,
      FAKE_DB_CAPABILITIES_MODE: "fail",
      FAKE_VIKE_ARGS_FILE: join(fixtureDirectory, "args.json"),
    });

    await expect(result).resolves.toMatchObject({ code: 16, signal: null });
    expect(existsSync(join(fixtureDirectory, "database-push.txt"))).toBe(false);
    expect(existsSync(join(fixtureDirectory, "initial-build.txt"))).toBe(false);
  });

  it("stops when the development schema push fails", async () => {
    const { result } = runDev([], {
      ...process.env,
      PATH: `${fixtureDirectory}${delimiter}${process.env.PATH ?? ""}`,
      FAKE_DB_PUSH_MODE: "fail",
      FAKE_VIKE_ARGS_FILE: join(fixtureDirectory, "args.json"),
    });

    await expect(result).resolves.toMatchObject({ code: 17, signal: null });
    expect(existsSync(join(fixtureDirectory, "initial-build.txt"))).toBe(false);
  });

  it("stops before application build when vector schema preparation fails", async () => {
    const { result } = runDev([], {
      ...process.env,
      PATH: `${fixtureDirectory}${delimiter}${process.env.PATH ?? ""}`,
      FAKE_VECTOR_RUNTIME_SCHEMA_MODE: "fail",
      FAKE_VIKE_ARGS_FILE: join(fixtureDirectory, "args.json"),
    });

    await expect(result).resolves.toMatchObject({ code: 18, signal: null });
    expect(existsSync(join(fixtureDirectory, "database-push.txt"))).toBe(true);
    expect(
      existsSync(join(fixtureDirectory, "vector-runtime-schema.txt")),
    ).toBe(false);
    expect(existsSync(join(fixtureDirectory, "initial-build.txt"))).toBe(false);
  });

  it("can skip the development schema push", async () => {
    const { result } = runDev([], {
      ...process.env,
      PATH: `${fixtureDirectory}${delimiter}${process.env.PATH ?? ""}`,
      CAT_DEV_DB_PUSH: "false",
      FAKE_EXPECT_DB_PUSH: "false",
      FAKE_VIKE_ARGS_FILE: join(fixtureDirectory, "args.json"),
      FAKE_VIKE_MODE: "success",
    });

    await expect(result).resolves.toMatchObject({ code: 0, signal: null });
    expect(
      existsSync(join(fixtureDirectory, "database-capabilities.txt")),
    ).toBe(false);
    expect(existsSync(join(fixtureDirectory, "database-push.txt"))).toBe(false);
    expect(
      existsSync(join(fixtureDirectory, "vector-runtime-schema.txt")),
    ).toBe(false);
  });

  it("requires explicit approval before pushing a remote database", async () => {
    const { result } = runDev([], {
      ...process.env,
      PATH: `${fixtureDirectory}${delimiter}${process.env.PATH ?? ""}`,
      DATABASE_URL: "postgresql://user:pass@database.example.com/cat",
      FAKE_VIKE_ARGS_FILE: join(fixtureDirectory, "args.json"),
    });

    await expect(result).resolves.toMatchObject({ code: 1, signal: null });
    expect((await result).stderr).toContain(
      "CAT_DEV_DB_PUSH_ALLOW_REMOTE=true",
    );
    expect(existsSync(join(fixtureDirectory, "database-push.txt"))).toBe(false);
  });

  it("refuses to push from a production process", async () => {
    const { result } = runDev([], {
      ...process.env,
      PATH: `${fixtureDirectory}${delimiter}${process.env.PATH ?? ""}`,
      DATABASE_URL: "postgresql://user:pass@localhost:25432/cat",
      FAKE_VIKE_ARGS_FILE: join(fixtureDirectory, "args.json"),
      NODE_ENV: "production",
    });

    await expect(result).resolves.toMatchObject({ code: 1, signal: null });
    expect((await result).stderr).toContain("production process");
    expect(existsSync(join(fixtureDirectory, "database-push.txt"))).toBe(false);
  });

  it("pushes an explicitly approved remote development database", async () => {
    const { result } = runDev([], {
      ...process.env,
      PATH: `${fixtureDirectory}${delimiter}${process.env.PATH ?? ""}`,
      CAT_DEV_DB_PUSH_ALLOW_REMOTE: "true",
      DATABASE_URL: "postgresql://user:pass@database.example.com/cat",
      FAKE_VIKE_ARGS_FILE: join(fixtureDirectory, "args.json"),
      FAKE_VIKE_MODE: "success",
    });

    await expect(result).resolves.toMatchObject({ code: 0, signal: null });
    await expect(
      readFile(join(fixtureDirectory, "database-push.txt"), "utf8"),
    ).resolves.toBe("pushed");
  });

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

  it("preserves Vike NDJSON when diagnostic capture is enabled", async () => {
    const { result } = runDev([], {
      ...process.env,
      CAT_DIAGNOSTIC_NDJSON: "true",
      PATH: `${fixtureDirectory}${delimiter}${process.env.PATH ?? ""}`,
      FAKE_VIKE_ARGS_FILE: join(fixtureDirectory, "args.json"),
      FAKE_VIKE_MODE: "success",
    });

    const output = await result;
    expect(output).toMatchObject({ code: 0, signal: null });
    expect(output.stdout).toContain('{"level":30');
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
      { interval: 20, timeout: 3_000 },
    );
  });
});
