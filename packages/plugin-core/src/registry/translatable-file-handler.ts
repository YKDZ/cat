import type { TranslatableElementData } from "@cat/shared/schema/misc";
import type { TranslatableElement } from "@cat/shared/schema/prisma/document";
import type { File } from "@cat/shared/schema/prisma/file";

export interface TranslatableFileHandler {
  getId(): string;
  canExtractElement(file: File): boolean;
  extractElement(file: File, fileContent: Buffer): TranslatableElementData[];
  canGetReplacedFileContent(file: File): boolean;
  getReplacedFileContent(
    file: File,
    fileContent: Buffer,
    elements: Pick<TranslatableElement, "meta" | "value">[],
  ): Promise<Buffer>;
}
