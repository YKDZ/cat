import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(import.meta.dirname, "..");

const run = async (command: string, args: string[]): Promise<void> =>
  await new Promise((resolveResult, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolveResult();
      else reject(new Error(`${command} ${args.join(" ")} failed: ${stderr}`));
    });
  });

export const pinnedBaseImage = (dockerfile: string): string => {
  const image = dockerfile.match(
    /^FROM\s+(node:[^\s]+)\s+AS\s+context-contract$/m,
  )?.[1];
  if (image === undefined) {
    throw new Error("Dockerfile does not define a context-contract Node image");
  }
  return image;
};

const main = async (): Promise<void> => {
  const image = pinnedBaseImage(
    await readFile(resolve(root, "apps/app/Dockerfile"), "utf8"),
  );
  await run("docker", ["buildx", "imagetools", "inspect", image]);
  process.stdout.write(`container base-image=${image} verified\n`);
};

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  await main();
}
