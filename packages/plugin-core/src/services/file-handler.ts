import type { PluginServiceType } from "@cat/shared/schema/enum";

import { JSONType } from "@cat/shared/schema/json";

import type { IPluginService } from "@/services/service";

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

export type ElementLocation = {
  /** 元素在源文件中的起始行（1-based），适用于纯文本文件 */
  startLine?: number;
  /** 元素在源文件中的结束行（1-based），适用于纯文本文件 */
  endLine?: number;
  /** 插件自定义定位信息（如 PDF 页码、markdown AST 路径等） */
  custom?: Record<string, unknown>;
};

export type ElementData = {
  meta: JSONType;
  text: string;
  sortIndex?: number;
  location?: ElementLocation;
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
