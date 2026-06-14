import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(import.meta.dirname, "..");

const retiredGuidanceRoot = `.${"cl"}aude`;
const claudeSpecificPatterns = [
  `${retiredGuidanceRoot}/rules`,
  `${retiredGuidanceRoot}/skills`,
  `${retiredGuidanceRoot}/agents`,
  `${retiredGuidanceRoot}/CLAUDE.md`,
] as const;

const pathExists = async (path: string) => {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
};

const listTrackedRepositoryFiles = async () => {
  const { stdout } = await execFileAsync(
    "git",
    ["ls-files", "--cached", "-z"],
    { cwd: repoRoot, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  );

  const candidateFiles = stdout.split("\0").filter(Boolean);

  const existingFiles = await Promise.all(
    candidateFiles.map(async (file) => ({
      file,
      exists: await pathExists(resolve(repoRoot, file)),
    })),
  );

  return existingFiles.filter(({ exists }) => exists).map(({ file }) => file);
};

describe("agent guidance surface", () => {
  it("does not leave tracked repository files depending on Claude-specific paths", async () => {
    const files = await listTrackedRepositoryFiles();
    const matches: string[] = [];

    await Promise.all(
      files.map(async (file) => {
        const content = await readFile(resolve(repoRoot, file), "utf8");
        for (const pattern of claudeSpecificPatterns) {
          if (content.includes(pattern)) {
            matches.push(`${file}: ${pattern}`);
          }
        }
      }),
    );

    expect(matches).toEqual([]);
  });
});
