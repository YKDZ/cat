import type { Node } from "ts-morph";

/**
 * @zh 符号的行列跨度（1-based 行号，0-based 列号）。
 * @en Column-aware span for a symbol (1-based line, 0-based column).
 */
export interface Span {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

/**
 * @zh 从 ts-morph Node 提取包含列号的跨度信息。
 * @en Extract a column-aware span from a ts-morph Node.
 */
export const getSpan = (node: Node): Span => {
  const sf = node.getSourceFile();
  const fullText = sf.getFullText();

  const startPos = node.getStart();
  const endPos = node.getEnd();

  const startLineStart = fullText.lastIndexOf("\n", startPos - 1) + 1;
  const endLineStart = fullText.lastIndexOf("\n", endPos - 1) + 1;

  return {
    line: node.getStartLineNumber(),
    column: startPos - startLineStart,
    endLine: node.getEndLineNumber(),
    endColumn: endPos - endLineStart,
  };
};
