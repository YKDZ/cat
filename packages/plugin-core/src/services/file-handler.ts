import type { IPluginService } from "@/services/service";
import { JSONType } from "@cat/shared/schema/json";
import type { PluginServiceType } from "@cat/shared/schema/drizzle/enum";

export type CanImportContext = {
  name: string;
};

export type ImportContext = {
  fileContent: Buffer;
};

export type CanExportContext = {
  name: string;
};

export type ExportContext = {
  fileContent: Buffer;
  elements: { meta: JSONType; text: string; sortIndex?: number }[];
};

export type ElementData = {
  meta: JSONType;
  text: string;
  sortIndex?: number;
};

export abstract class FileImporter implements IPluginService {
  abstract getId(): string;
  getType(): PluginServiceType {
    return "FILE_IMPORTER";
  }
  abstract canImport(ctx: CanImportContext): boolean;
  abstract import(ctx: ImportContext): Promise<ElementData[]>;
}

export abstract class FileExporter implements IPluginService {
  abstract getId(): string;
  getType(): PluginServiceType {
    return "FILE_EXPORTER";
  }
  abstract canExport(ctx: CanExportContext): boolean;
  abstract export(ctx: ExportContext): Promise<Buffer>;
}
