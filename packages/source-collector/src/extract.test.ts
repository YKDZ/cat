import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";

import { extract } from "./extract";
import { vueI18nExtractor } from "./extractors/vue-i18n";

test("extract from Vue file produces source-file node, primary containment relation, and evidence attached to element", async () => {
  const baseDir = join(tmpdir(), `source-collector-test-${Date.now()}`);
  await mkdir(join(baseDir, "src"), { recursive: true });

  const vueContent = `<template>
  <div>{{ $t('greeting') }}</div>
</template>
<script setup>
const msg = t('farewell');
</script>
`;
  await writeFile(join(baseDir, "src", "App.vue"), vueContent, "utf-8");

  const result = await extract({
    globs: ["src/**/*.vue"],
    extractors: [vueI18nExtractor],
    baseDir,
  });

  const relPath = "src/App.vue";
  const sourceNodeRef = `source-file:${relPath}`;

  // Should have a file node (plus possibly a root sentinel node)
  const fileNode = result.nodes.find((n) => n.ref === sourceNodeRef);
  expect(fileNode).toBeDefined();
  expect(fileNode?.kind).toBe("SOURCE_COMPONENT");

  // Should have extracted elements
  expect(result.elements.length).toBeGreaterThanOrEqual(1);

  // Each element should have stableSourceRef, sourceNodeRef, localOrder
  for (const el of result.elements) {
    expect(el.stableSourceRef).toBeTruthy();
    expect(el.sourceNodeRef).toBe(sourceNodeRef);
    expect(typeof el.localOrder).toBe("number");
  }

  // Should have primary containment relations (one per element)
  const primaryRelations = result.relations.filter((r) => r.isPrimary);
  expect(primaryRelations.length).toBe(result.elements.length);
  for (const rel of primaryRelations) {
    expect(rel.source).toEqual({ kind: "NODE", nodeRef: sourceNodeRef });
    expect(rel.type.namespace).toBe("core");
    expect(rel.type.name).toBe("contains");
  }

  // Should have evidence for each element (at least SOURCE_LOCATION)
  const evidenceRefs = result.evidence.map((e) =>
    "elementRef" in e.attachedTo ? e.attachedTo.elementRef : null,
  );
  for (const el of result.elements) {
    expect(evidenceRefs).toContain(el.ref);
  }
});
