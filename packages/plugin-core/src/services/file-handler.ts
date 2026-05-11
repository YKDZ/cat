import type { PluginServiceType } from "@cat/shared";
import type {
  RegisteredRelationTypeInput,
  StructuredEvidenceInput,
  StructuredRelationInput,
} from "@cat/shared";

import type { IPluginService } from "@/services/service";

export type CanImportContext = {
  name: string;
};

export type CanExportContext = {
  name: string;
};

export type ElementData = {
  ref: string;
  stableSourceRef: string;
  sourceNodeRef?: string;
  text: string;
  meta?: unknown;
  localOrder?: number;
  location?: {
    startLine?: number;
    endLine?: number;
    custom?: unknown;
  };
};

export type FileImportResult = {
  importerId: string;
  sourceRootRef: string;
  sourceNode: {
    ref: string;
    stableSourceNodeRef: string;
    displayLabel: string;
    sourcePath?: string;
    sourceType?: string;
  };
  relationTypes?: RegisteredRelationTypeInput[];
  elements: ElementData[];
  relations?: StructuredRelationInput[];
  evidence?: StructuredEvidenceInput[];
};

export type ImportContext = {
  fileContent: Buffer;
  name: string;
  fileId: number;
  contentNodeId?: string;
  sourceRootRef: string;
  sourceNodeRef: string;
  stableSourceNodeRef: string;
};

export type ExportContext = {
  fileContent: Buffer;
  elements: Array<{
    ref: string;
    stableSourceRef: string;
    meta: unknown;
    text: string;
    localOrder: number;
  }>;
};

export abstract class FileImporter implements IPluginService {
  abstract getId(): string;
  getType(): PluginServiceType {
    return "FILE_IMPORTER";
  }
  abstract canImport(ctx: CanImportContext): boolean;
  abstract import(ctx: ImportContext): Promise<FileImportResult>;
}

export abstract class FileExporter implements IPluginService {
  abstract getId(): string;
  getType(): PluginServiceType {
    return "FILE_EXPORTER";
  }
  abstract canExport(ctx: CanExportContext): boolean;
  abstract export(ctx: ExportContext): Promise<Buffer>;
}
