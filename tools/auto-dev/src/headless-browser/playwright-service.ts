import { execSync } from "node:child_process";

export class PlaywrightService {
  private readonly workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  runTest(testFile: string): string {
    try {
      return execSync(`npx playwright test ${testFile} --reporter=json`, {
        encoding: "utf-8",
        cwd: this.workspaceRoot,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      const stderr =
        err instanceof Error && "stderr" in err
          ? String((err as { stderr: string }).stderr)
          : String(err);
      return JSON.stringify({ error: stderr });
    }
  }

  runAll(): string {
    try {
      return execSync("npx playwright test --reporter=json", {
        encoding: "utf-8",
        cwd: this.workspaceRoot,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      return JSON.stringify({ error: String(err) });
    }
  }
}
