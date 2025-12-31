import type { TranslatableElementDataWithoutLanguageId } from "@cat/shared/schema/misc";
import type { IPluginService } from "@/services/service";
import { JSONType } from "@cat/shared/schema/json";
import type { PluginServiceType } from "@cat/shared/schema/drizzle/enum";

export type CanExtractElementContext = {
  name: string;
};

export type ExtractElementContext = {
  fileContent: Buffer;
};

export type CanGetReplacedFileContentContext = {
  name: string;
};

export type GetReplacedFileContentContext = {
  fileContent: Buffer;
  elements: { meta: JSONType; value: string }[];
};

export abstract class TranslatableFileHandler implements IPluginService {
  abstract getId(): string;
  getType(): PluginServiceType {
    return "TRANSLATABLE_FILE_HANDLER";
  }
  abstract canExtractElement(ctx: CanExtractElementContext): boolean;
  abstract extractElement(
    ctx: ExtractElementContext,
  ): Promise<TranslatableElementDataWithoutLanguageId[]>;
  abstract canGetReplacedFileContent(
    ctx: CanGetReplacedFileContentContext,
  ): boolean;
  abstract getReplacedFileContent(
    ctx: GetReplacedFileContentContext,
  ): Promise<Buffer>;
}
