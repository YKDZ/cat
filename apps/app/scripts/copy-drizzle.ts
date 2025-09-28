import { join } from "node:path";
import { copyFile, mkdir, readdir } from "node:fs/promises";
import { cwd } from "node:process";
import { workspaceRoot } from "@nx/devkit";

async function copyDir(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });

  const entries = await readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      await copyFile(srcPath, destPath);
    }
  }
}

await (async () => {
  copyDir(
    join(workspaceRoot, "packages", "db", "drizzle"),
    join(cwd(), "drizzle"),
  );
})();
