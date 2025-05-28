// copy-plugins.js
import { promises as fs } from 'fs';
import path, { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

// 获取当前文件的目录路径（替代 __dirname）
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 源目录和目标目录
const SRC_DIR = resolve(__dirname, '../packages/@cat-plugin');
const DEST_DIR = resolve(__dirname, '../apps/app/plugins');

// 需要拷贝的文件和文件夹（在插件目录内）
const FILE_INCLUDES = [
  'dist',           // 文件夹
  'package.json',   // 文件
  'manifest.json',  // 文件
];

// 需要处理的插件目录（SRC_DIR 下的一级目录）
const FOLDER_INCLUDES = [
  'ollama-vectorizer',
  'libretranslate-advisor',
  'json-file-handler'
];

/**
 * 递归拷贝函数：将 srcPath 下的所有内容拷贝到 destPath
 * @param {string} srcPath
 * @param {string} destPath
 */
async function copyRecursive(srcPath, destPath) {
  const stats = await fs.stat(srcPath);

  if (stats.isDirectory()) {
    await fs.mkdir(destPath, { recursive: true });
    const entries = await fs.readdir(srcPath);
    for (const entry of entries) {
      await copyRecursive(
        join(srcPath, entry),
        join(destPath, entry)
      );
    }
  } else if (stats.isFile()) {
    await fs.copyFile(srcPath, destPath);
  }
}

(async () => {
  try {
    // 确保目标根目录存在
    await fs.mkdir(DEST_DIR, { recursive: true });

    // 读取源目录下的一级条目
    const pluginFolders = await fs.readdir(SRC_DIR);

    for (const folder of pluginFolders) {
      // 跳过不在白名单中的目录
      if (!FOLDER_INCLUDES.includes(folder)) continue;

      const srcFolderPath = join(SRC_DIR, folder);
      const destFolderPath = join(DEST_DIR, folder);

      // 确保目标插件目录存在
      await fs.mkdir(destFolderPath, { recursive: true });

      // 读取插件目录内容
      const pluginContents = await fs.readdir(srcFolderPath);

      for (const item of pluginContents) {
        // 跳过不在白名单中的文件和文件夹
        if (!FILE_INCLUDES.includes(item)) continue;

        const srcPath = join(srcFolderPath, item);
        const destPath = join(destFolderPath, item);

        // 递归拷贝项目（文件或目录）
        await copyRecursive(srcPath, destPath);
      }
    }

    console.log('拷贝完成！');
  } catch (err) {
    console.error('拷贝过程中出错：', err);
    process.exit(1);
  }
})();