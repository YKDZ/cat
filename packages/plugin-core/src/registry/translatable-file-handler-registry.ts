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
