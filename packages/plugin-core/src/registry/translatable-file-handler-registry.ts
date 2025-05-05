import { Document, File, Translation } from "@cat/shared";
import { TranslatableElementData } from "@cat/shared";

export interface TranslatableFileHandler {
  detectDocumentTypeFromFile(file: File): string | void;
  canExtractElementFromFile(document: Document, fileContent: string): boolean;
  extractElementFromFile(
    document: Document,
    fileContent: string,
  ): TranslatableElementData[];
  canGenerateTranslatedFile(document: Document, fileContent: string): boolean;
  generateTranslatedFile(
    document: Document,
    fileContent: string,
    translations: Translation[],
  ): string;
}

export class TranslatableFileHandlerRegistry {
  private static instance: TranslatableFileHandlerRegistry;
  private handlers: TranslatableFileHandler[] = [];

  private constructor() {}

  public static getInstance(): TranslatableFileHandlerRegistry {
    if (!TranslatableFileHandlerRegistry.instance) {
      TranslatableFileHandlerRegistry.instance =
        new TranslatableFileHandlerRegistry();
    }
    return TranslatableFileHandlerRegistry.instance;
  }

  register(handler: TranslatableFileHandler) {
    this.handlers.push(handler);
  }

  unregister(handler: TranslatableFileHandler) {
    this.handlers.splice(this.handlers.indexOf(handler), 1);
  }

  getHandlers() {
    return this.handlers;
  }
}
