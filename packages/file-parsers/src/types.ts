/**
 * Optional source location information.
 */
export interface ElementLocation {
  startLine?: number;
  endLine?: number;
  custom?: Record<string, unknown>;
}

/**
 * A parsed translatable element with stable identity references and local order.
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
 * Minimal element descriptor needed for serialization.
 */
export interface SerializeElement {
  ref?: string;
  stableSourceRef?: string;
  meta: unknown;
  text: string;
  localOrder?: number;
}

/**
 * File parser interface: parses file content into translatable elements and serializes translated elements back to file content.
 */
export type FileParser = {
  id: string;
  canParse(fileName: string): boolean;
  parse(content: string): ElementData[];
  serialize(content: string, elements: SerializeElement[]): string;
};
