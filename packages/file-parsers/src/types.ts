/**
 * @zh 可选的源位置信息。
 * @en Optional source location information.
 */
export interface ElementLocation {
  startLine?: number;
  endLine?: number;
  custom?: Record<string, unknown>;
}

/**
 * @zh 解析出的可翻译元素，包含稳定标识引用和本地顺序。
 * @en A parsed translatable element with stable identity references and local order.
 */
export interface ElementData {
  ref: string;
  stableSourceRef: string;
  text: string;
  meta?: unknown;
  localOrder?: number;
  location?: ElementLocation;
}

/**
 * @zh 序列化所需的最小元素描述。
 * @en Minimal element descriptor needed for serialization.
 */
export interface SerializeElement {
  ref?: string;
  stableSourceRef?: string;
  meta: unknown;
  text: string;
  localOrder?: number;
}

/**
 * @zh 文件解析器接口：负责将文件内容解析为可翻译元素，以及将翻译结果序列化回文件。
 * @en File parser interface: parses file content into translatable elements and serializes translated elements back to file content.
 */
export type FileParser = {
  id: string;
  canParse(fileName: string): boolean;
  parse(content: string): ElementData[];
  serialize(content: string, elements: SerializeElement[]): string;
};
