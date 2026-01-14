import { promises as fs } from "fs";
import { join, resolve } from "path";

const SRC_DIR = resolve(import.meta.dirname, "../packages/@cat-plugin");
const DEST_DIR = resolve(import.meta.dirname, "../apps/app/plugins");

const copyRecursive = async (srcPath, destPath) => {
  try {
    const stats = await fs.stat(srcPath);

    if (stats.isDirectory()) {
      await fs.mkdir(destPath, { recursive: true });
      const entries = await fs.readdir(srcPath);
      for (const entry of entries) {
        await copyRecursive(join(srcPath, entry), join(destPath, entry));
      }
    } else if (stats.isFile()) {
      const parentDir = resolve(destPath, "..");
      await fs.mkdir(parentDir, { recursive: true });
      await fs.copyFile(srcPath, destPath);
    }
  } catch (err) {
    if (err.code === "ENOENT") {
      console.warn(`Warning: Could not find ${srcPath} listed in package.json`);
    } else {
      throw err;
    }
  }
};

await (async () => {
  try {
    await fs.mkdir(DEST_DIR, { recursive: true });

    const pluginFolders = await fs.readdir(SRC_DIR);
    const copiedPlugins = [];

    for (const folder of pluginFolders) {
      const srcFolderPath = join(SRC_DIR, folder);

      const stats = await fs.stat(srcFolderPath).catch(() => null);
      if (!stats || !stats.isDirectory()) continue;

      const packageJsonPath = join(srcFolderPath, "package.json");
      let packageJson;
      try {
        const content = await fs.readFile(packageJsonPath, "utf-8");
        packageJson = JSON.parse(content);
      } catch (e) {
        console.warn(`Warning: Could not read or parse ${packageJsonPath}:`, e);
        continue;
      }

      const fileIncludes = packageJson.files || ["dist", "manifest.json"];
      if (!fileIncludes.includes("package.json")) {
        fileIncludes.push("package.json");
      }

      const destFolderPath = join(DEST_DIR, folder);

      await fs.rm(destFolderPath, { recursive: true, force: true });
      await fs.mkdir(destFolderPath, { recursive: true });

      for (const item of fileIncludes) {
        const srcPath = join(srcFolderPath, item);
        const destPath = join(destFolderPath, item);

        await copyRecursive(srcPath, destPath);
      }

      copiedPlugins.push(folder);
    }

    console.log("成功加载插件：\n" + copiedPlugins.join("\n"));
  } catch (err) {
    console.error("拷贝过程中出错：", err);
    process.exit(1);
  }
})();
