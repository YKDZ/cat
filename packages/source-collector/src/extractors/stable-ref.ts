import { createHash } from "node:crypto";

/**
 * @zh 构建稳定源码引用所需的输入。
 * @en Input required to build a stable source reference.
 */
export type StableSourceRefInput = {
  /** @zh 提取器 ID。 @en Extractor ID. */
  extractorId: string;
  /** @zh 相对文件路径。 @en Relative source file path. */
  filePath: string;
  /** @zh 文件内区段。 @en Section inside the file. */
  section: string;
  /** @zh 不含源码行号和源文本的语法锚点。 @en Syntax anchor excluding source line number and source text. */
  anchorPath: string;
  /** @zh 调用类型。 @en Call kind. */
  callKind?: string;
  /** @zh 同一锚点内的调用序号。 @en Call ordinal within the same anchor. */
  ordinal: number;
};

/**
 * @zh 归一化 i18n 文本以便稳定引用和 locale 匹配。
 * @en Normalize i18n text for stable references and locale matching.
 *
 * @param text - {@zh 原始文本} {@en Raw text}
 * @returns - {@zh 归一化后的文本} {@en Normalized text}
 */
export const normalizeI18nText = (text: string): string => {
  return text.normalize("NFC").trim().replace(/\s+/g, " ");
};

const shortHash = (value: string): string => {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
};

/**
 * @zh 构建源文本指纹，仅用于诊断和 meta，不参与稳定身份。
 * @en Build a source text fingerprint for diagnostics and meta only, not stable identity.
 *
 * @param text - {@zh 原始文本} {@en Raw text}
 * @returns - {@zh 短文本指纹} {@en Short text fingerprint}
 */
export const buildTextFingerprint = (text: string): string => {
  return shortHash(normalizeI18nText(text));
};

/**
 * @zh 构建不依赖源码行号的稳定元素引用。
 * @en Build a stable element reference that does not depend on source line numbers.
 *
 * @param input - {@zh 稳定引用输入} {@en Stable reference input}
 * @returns - {@zh 稳定源码引用} {@en Stable source reference}
 */
export const buildStableSourceRef = (input: StableSourceRefInput): string => {
  const callKind = input.callKind ?? "call";
  const fingerprint = shortHash(
    [
      input.extractorId,
      input.filePath,
      input.section,
      input.anchorPath,
      callKind,
      String(input.ordinal),
    ].join("\u0000"),
  );

  return `${input.extractorId}:${input.filePath}:${input.section}:${input.anchorPath}:${callKind}:#${input.ordinal}:${fingerprint}`;
};
