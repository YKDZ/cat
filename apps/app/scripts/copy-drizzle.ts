import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { cwd } from "node:process";

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
  const dest = join(cwd(), "drizzle");
  await rm(dest, { recursive: true, force: true });
  await copyDir(join(cwd(), "..", "..", "packages", "db", "drizzle"), dest);
})();
