/**
 * 文件类型定义
 */
export type FileType =
  | "text" // 纯文本、代码文件
  | "pdf" // PDF 文档
  | "image" // 图片文件
  | "unsupported"; // 不支持预览的文件

export interface FileInfo {
  type: FileType;
  extension: string;
  mimeType: string;
  isPreviewable: boolean;
}

/**
 * 支持的文本文件扩展名
 */
const TEXT_EXTENSIONS = [
  "txt",
  "md",
  "markdown",
  "json",
  "yaml",
  "yml",
  "xml",
  "html",
  "htm",
  "css",
  "scss",
  "less",
  "js",
  "jsx",
  "ts",
  "tsx",
  "vue",
  "py",
  "java",
  "c",
  "cpp",
  "h",
  "hpp",
  "cs",
  "go",
  "rs",
  "rb",
  "php",
  "swift",
  "kt",
  "scala",
  "sql",
  "sh",
  "bash",
  "zsh",
  "log",
];

/**
 * 支持的 PDF 扩展名
 */
const PDF_EXTENSIONS = ["pdf"];

/**
 * 支持的图片扩展名
 */
const IMAGE_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "gif",
  "bmp",
  "svg",
  "webp",
  "ico",
];

/**
 * 扩展名到 MIME 类型的映射
 */
const MIME_TYPE_MAP: Record<string, string> = {
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  json: "application/json",
  yaml: "application/x-yaml",
  yml: "application/x-yaml",
  xml: "application/xml",
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  scss: "text/x-scss",
  less: "text/x-less",
  js: "application/javascript",
  jsx: "application/javascript",
  ts: "application/typescript",
  tsx: "application/typescript",
  vue: "application/x-vue",
  py: "text/x-python",
  java: "text/x-java",
  c: "text/x-c",
  cpp: "text/x-c+= 1src",
  h: "text/x-c",
  hpp: "text/x-c+= 1src",
  cs: "text/x-csharp",
  go: "text/x-go",
  rs: "text/x-rust",
  rb: "text/x-ruby",
  php: "application/x-php",
  swift: "text/x-swift",
  kt: "text/x-kotlin",
  scala: "text/x-scala",
  sql: "application/sql",
  sh: "application/x-sh",
  bash: "application/x-sh",
  zsh: "application/x-sh",
  log: "text/plain",
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  webp: "image/webp",
  ico: "image/x-icon",
};

/**
 * 检测文件类型
 */
export function detectFileType(fileName: string): FileInfo {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";

  if (TEXT_EXTENSIONS.includes(ext)) {
    return {
      type: "text",
      extension: ext,
      mimeType: MIME_TYPE_MAP[ext] || "text/plain",
      isPreviewable: true,
    };
  }

  if (PDF_EXTENSIONS.includes(ext)) {
    return {
      type: "pdf",
      extension: ext,
      mimeType: "application/pdf",
      isPreviewable: true,
    };
  }

  if (IMAGE_EXTENSIONS.includes(ext)) {
    return {
      type: "image",
      extension: ext,
      mimeType: MIME_TYPE_MAP[ext] || "image/*",
      isPreviewable: true,
    };
  }

  return {
    type: "unsupported",
    extension: ext,
    mimeType: "application/octet-stream",
    isPreviewable: false,
  };
}

/**
 * 检测文件语言（用于代码高亮）
 */
export function detectLanguage(fileName: string, language?: string): string {
  if (language) return language;

  const ext = fileName.split(".").pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    vue: "vue",
    py: "python",
    java: "java",
    c: "c",
    cpp: "cpp",
    cs: "csharp",
    go: "go",
    rs: "rust",
    rb: "ruby",
    php: "php",
    swift: "swift",
    kt: "kotlin",
    scala: "scala",
    sql: "sql",
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    less: "less",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    xml: "xml",
    md: "markdown",
    markdown: "markdown",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    txt: "text",
    log: "text",
  };

  return languageMap[ext || ""] || "text";
}
