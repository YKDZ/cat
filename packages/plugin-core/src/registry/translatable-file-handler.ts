import { File, Translation } from "@cat/shared";
import { TranslatableElementData } from "@cat/shared";

export interface TranslatableFileHandler {
  getId(): string;
  canExtractElement(file: File): boolean;
  extractElement(file: File, fileContent: string): TranslatableElementData[];
  canGenerateTranslated(file: File, fileContent: string): boolean;
  generateTranslated(
    file: File,
    fileContent: string,
    translations: Translation[],
  ): string;
}
