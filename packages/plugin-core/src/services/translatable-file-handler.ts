import type { TranslatableElementDataWithoutLanguageId } from "@cat/shared/schema/misc";
import type { IPluginService } from "@/services/service";
import { JSONType } from "@cat/shared/schema/json";
import type { PluginServiceType } from "@cat/shared/schema/drizzle/enum";

export abstract class TranslatableFileHandler implements IPluginService {
  abstract getId(): string;
  getType(): PluginServiceType {
    return "TRANSLATABLE_FILE_HANDLER";
  }
  abstract canExtractElement(name: string): boolean;
  abstract extractElement(
    fileContent: Buffer,
  ): Promise<TranslatableElementDataWithoutLanguageId[]>;
  abstract canGetReplacedFileContent(name: string): boolean;
  abstract getReplacedFileContent(
    fileContent: Buffer,
    elements: { meta: JSONType; value: string }[],
  ): Promise<Buffer>;
}
