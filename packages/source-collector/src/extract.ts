// oxlint-disable no-console
import type {
  StructuredContentNodeInput,
  StructuredEvidenceInput,
  StructuredRelationInput,
  StructuredTranslatableElementInput,
} from "@cat/shared";

import { glob } from "glob";
import { readFile } from "node:fs/promises";
import { extname, relative } from "node:path";

import type {
  SourceExtractionGraphResult,
  SourceExtractOptions,
} from "./types.ts";

/**
 * @zh 从源文件中纯粹提取可翻译元素，返回图结构结果（不含平台参数）。
 * @en Extract translatable elements from source files, returning graph-structured result (no platform params).
 */
export async function extract(
  options: SourceExtractOptions,
): Promise<SourceExtractionGraphResult> {
  const { globs, extractors, baseDir } = options;

  const files = (await glob(globs, { cwd: baseDir, absolute: true })).sort();

  const extMap = new Map<string, (typeof extractors)[number]>();
  for (const ext of extractors) {
    for (const supportedExt of ext.supportedExtensions) {
      if (!extMap.has(supportedExt)) {
        extMap.set(supportedExt, ext);
      }
    }
  }

  const allNodes: StructuredContentNodeInput[] = [];
  const allElements: StructuredTranslatableElementInput[] = [];
  const allRelations: StructuredRelationInput[] = [];
  const allEvidence: StructuredEvidenceInput[] = [];

  const results = await Promise.all(
    files.map(async (absPath) => {
      const relPath = relative(baseDir, absPath);
      const ext = extname(absPath);

      const extractor = extMap.get(ext);
      if (!extractor) return null;

      let content: string;
      try {
        content = await readFile(absPath, "utf-8");
      } catch (err) {
        console.warn(
          `[WARN] Failed to read ${relPath}: ${err instanceof Error ? err.message : String(err)}`,
        );
        return null;
      }

      let elements: StructuredTranslatableElementInput[];
      try {
        elements = extractor.extract({ content, filePath: relPath });
      } catch (err) {
        console.warn(
          `[WARN] Extraction failed for ${relPath}: ${err instanceof Error ? err.message : String(err)}`,
        );
        return null;
      }

      const sourceNodeRef = `source-file:${relPath}`;
      const fileNode: StructuredContentNodeInput = {
        ref: sourceNodeRef,
        kind: "SOURCE_COMPONENT",
        displayLabel: relPath,
        importerId: extractor.id,
        sourceRootRef: baseDir,
        stableSourceNodeRef: sourceNodeRef,
        sourcePath: relPath,
        sourceType: ext.replace(".", ""),
        exportRole: "NONE",
        boundaryType: "FILE",
      };

      const fileRelations: StructuredRelationInput[] = [];
      const fileEvidence: StructuredEvidenceInput[] = [];

      for (const el of elements) {
        fileRelations.push({
          type: { namespace: "core", name: "contains", version: "1" },
          source: { kind: "NODE" as const, nodeRef: sourceNodeRef },
          target: { kind: "ELEMENT" as const, elementRef: el.ref },
          localOrder: el.localOrder ?? 0,
          isPrimary: true,
          confidenceBasisPoints: 10000,
        });

        fileEvidence.push({
          attachedTo: { kind: "ELEMENT", elementRef: el.ref },
          kind: "SOURCE_LOCATION",
          textData: `Source: ${relPath}`,
          displayLabel: "source file",
          trustLevel: "COLLECTED",
          provenance: { extractorId: extractor.id, filePath: relPath },
        });

        function getI18nContext(v: unknown): string | undefined {
          if (v !== null && typeof v === "object" && "i18nContext" in v) {
            const ctx = (v as { i18nContext: unknown }).i18nContext;
            return typeof ctx === "string" ? ctx : undefined;
          }
          return undefined;
        }
        const i18nCtx = getI18nContext(el.location?.custom);
        if (typeof i18nCtx === "string") {
          fileEvidence.push({
            attachedTo: { kind: "ELEMENT", elementRef: el.ref },
            kind: "TEXT",
            textData: i18nCtx,
            displayLabel: "i18n context comment",
            trustLevel: "COLLECTED",
            provenance: { extractorId: extractor.id, filePath: relPath },
          });
        }
      }

      return {
        fileNode,
        elements,
        relations: fileRelations,
        evidence: fileEvidence,
      };
    }),
  );

  for (const result of results) {
    if (!result) continue;
    allNodes.push(result.fileNode);
    allElements.push(...result.elements);
    allRelations.push(...result.relations);
    allEvidence.push(...result.evidence);
  }

  const importerId = extractors.map((e) => e.id).join(",");

  // Always add a root node representing the base directory so the payload
  // always satisfies the nodes.min(1) constraint.
  const rootNodeRef = `source-root:${baseDir}`;
  if (!allNodes.some((n) => n.ref === rootNodeRef)) {
    allNodes.unshift({
      ref: rootNodeRef,
      kind: "SOURCE_COMPONENT",
      displayLabel: baseDir,
      importerId,
      sourceRootRef: baseDir,
      stableSourceNodeRef: rootNodeRef,
      exportRole: "NONE",
      boundaryType: "FILE",
    });
  }

  return {
    importerId,
    relationTypes: [],
    nodes: allNodes,
    elements: allElements,
    relations: allRelations,
    evidence: allEvidence,
  };
}
