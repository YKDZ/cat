import { join } from "node:path";
import { copyFile, mkdir, readdir } from "node:fs/promises";
import { cwd } from "node:process";
import { workspaceRoot } from "@nx/devkit";

async function copyDir(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });

  const entries = await readdir(src, { withFileTypes: true });

  await Promise.all(
    entries.map(async (entry) => {
      const srcPath = join(src, entry.name);
      const destPath = join(dest, entry.name);

      if (entry.isDirectory()) {
        await copyDir(srcPath, destPath);
      } else if (entry.isFile()) {
        await copyFile(srcPath, destPath);
      }
    }),
  );
}

await (async () => {
  await copyDir(
    join(workspaceRoot, "packages", "db", "drizzle"),
    join(cwd(), "drizzle"),
  );
})();
