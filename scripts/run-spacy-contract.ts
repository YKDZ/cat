import { spawn, type ChildProcess } from "node:child_process";

const rootDir = new URL("../", import.meta.url);
const environment = process.env;
const serverUrl =
  environment.SPACY_CONTRACT_SERVER_URL ?? "http://127.0.0.1:8000";
const shouldStartServer = environment.SPACY_CONTRACT_SERVER_URL === undefined;

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const waitForExit = async (child: ChildProcess): Promise<number | null> => {
  if (child.exitCode !== null || child.signalCode !== null) {
    return child.exitCode;
  }

  return new Promise((resolve, reject) => {
    const onExit = (code: number | null) => {
      child.off("error", onError);
      resolve(code);
    };
    const onError = (error: Error) => {
      child.off("exit", onExit);
      reject(error);
    };

    child.once("exit", onExit);
    child.once("error", onError);
  });
};

const stopProcess = async (child: ChildProcess): Promise<void> => {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill("SIGTERM");
  const exited = await Promise.race([
    waitForExit(child).then(() => true),
    sleep(5000).then(() => false),
  ]);

  if (!exited && child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await waitForExit(child).catch(() => undefined);
  }
};

const waitForHealth = async (url: string, timeoutMs: number): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      // oxlint-disable-next-line no-await-in-loop
      const response = await fetch(`${url}/health`);
      if (response.ok) return;
    } catch {
      // ignored
    }
    // oxlint-disable-next-line no-await-in-loop
    await sleep(1000);
  }
  throw new Error(`spaCy server at ${url} did not become healthy in time`);
};

const run = async (): Promise<void> => {
  let child: ChildProcess | undefined;

  if (shouldStartServer) {
    child = spawn("pnpm", ["nx", "run", "spacy-server:serve"], {
      cwd: rootDir,
      stdio: "inherit",
      env: environment,
    });
  }

  try {
    await waitForHealth(serverUrl, 60_000);

    const testProcess = spawn(
      "pnpm",
      [
        "--filter",
        "@cat-plugin/spacy-segmenter",
        "test",
        "--",
        "src/segmenter.spec.ts",
      ],
      {
        cwd: rootDir,
        stdio: "inherit",
        env: {
          ...environment,
          SPACY_CONTRACT_SERVER_URL: serverUrl,
        },
      },
    );

    const code = await waitForExit(testProcess);
    if (code !== 0) {
      throw new Error(
        `spaCy contract tests failed with exit code ${code ?? -1}`,
      );
    }
  } finally {
    if (child) {
      await stopProcess(child);
    }
  }
};

await run();
