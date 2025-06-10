import { promises as fs } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SRC_DIR = resolve(__dirname, "../packages/@cat-plugin");
const DEST_DIR = resolve(__dirname, "../apps/app/plugins");

const FILE_INCLUDES = ["dist", "package.json", "manifest.json"];

const FOLDER_INCLUDES = [
  "ollama-vectorizer",
  "libretranslate-advisor",
  "json-file-handler",
  "oidc-auth-provider",
  "username-password-auth-provider",
];

async function copyRecursive(srcPath, destPath) {
  const stats = await fs.stat(srcPath);

  if (stats.isDirectory()) {
    await fs.mkdir(destPath, { recursive: true });
    const entries = await fs.readdir(srcPath);
    for (const entry of entries) {
      await copyRecursive(join(srcPath, entry), join(destPath, entry));
    }
  } else if (stats.isFile()) {
    await fs.copyFile(srcPath, destPath);
  }
}

(async () => {
  try {
    await fs.mkdir(DEST_DIR, { recursive: true });

    const pluginFolders = await fs.readdir(SRC_DIR);

    for (const folder of pluginFolders) {
      if (!FOLDER_INCLUDES.includes(folder)) continue;

      const srcFolderPath = join(SRC_DIR, folder);
      const destFolderPath = join(DEST_DIR, folder);

      await fs.mkdir(destFolderPath, { recursive: true });
      await fs.rm(destFolderPath, { recursive: true });
      await fs.mkdir(destFolderPath, { recursive: true });

      const pluginContents = await fs.readdir(srcFolderPath);

      for (const item of pluginContents) {
        if (!FILE_INCLUDES.includes(item)) continue;

        const srcPath = join(srcFolderPath, item);
        const destPath = join(destFolderPath, item);

        await copyRecursive(srcPath, destPath);
      }
    }

    console.log("成功拷贝指定的本地插件：" + FOLDER_INCLUDES.join(", "));
  } catch (err) {
    console.error("拷贝过程中出错：", err);
    process.exit(1);
  }
})();
