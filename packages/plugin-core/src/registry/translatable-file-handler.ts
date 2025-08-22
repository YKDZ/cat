import type { File, TranslatableElement } from "@cat/shared";
import type { TranslatableElementData } from "@cat/shared";

export interface TranslatableFileHandler {
  getId(): string;
  canExtractElement(file: File): boolean;
  extractElement(file: File, fileContent: Buffer): TranslatableElementData[];
  canGenerateTranslated(file: File): boolean;
  getReplacedFileContent(
    file: File,
    fileContent: Buffer,
    elements: Pick<TranslatableElement, "meta" | "value">[],
  ): Promise<Buffer>;
}
