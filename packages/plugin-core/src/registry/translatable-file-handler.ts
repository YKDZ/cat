import type { TranslatableElementData } from "@cat/shared/schema/misc";
import type { TranslatableElement } from "@cat/shared/schema/prisma/document";
import type { File } from "@cat/shared/schema/prisma/file";
import type { IPluginService } from "@/registry/plugin-registry.ts";

export interface TranslatableFileHandler extends IPluginService {
  canExtractElement(file: File): boolean;
  extractElement(file: File, fileContent: Buffer): TranslatableElementData[];
  canGetReplacedFileContent(file: File): boolean;
  getReplacedFileContent(
    file: File,
    fileContent: Buffer,
    elements: Pick<TranslatableElement, "meta" | "value">[],
  ): Promise<Buffer>;
}
