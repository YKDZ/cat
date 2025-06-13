import type { File, Translation } from "@cat/shared";
import type { TranslatableElementData } from "@cat/shared";

export interface TranslatableFileHandler {
  getId(): string;
  canExtractElement(file: File): boolean;
  extractElement(file: File, fileContent: Buffer): TranslatableElementData[];
  canGenerateTranslated(file: File): boolean;
  generateTranslated(
    file: File,
    fileContent: Buffer,
    translations: Translation[],
  ): Promise<Buffer>;
}
