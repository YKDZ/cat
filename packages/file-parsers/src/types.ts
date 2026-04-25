import type { JSONType } from "@cat/shared";

export type { JSONType };

/**
 * @zh 可选的源位置信息。
 * @en Optional source location information.
 */
export type ElementLocation = {
  startLine?: number;
  endLine?: number;
  custom?: Record<string, unknown>;
};

/**
 * @zh 解析出的可翻译元素。
 * @en A parsed translatable element.
 */
export type ElementData = {
  meta: JSONType;
  text: string;
  sortIndex?: number;
  location?: ElementLocation;
};

/**
 * @zh 序列化所需的最小元素描述。
 * @en Minimal element descriptor needed for serialization.
 */
export type SerializeElement = {
  meta: JSONType;
  text: string;
};

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
