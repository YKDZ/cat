<script setup lang="ts">
import { diffLines } from "diff";
import { computed, ref } from "vue";
import DiffBoxSplit from "./DiffBoxSplit.vue";
import DiffBoxUnified from "./DiffBoxUnified.vue";
import type { DiffedLine } from "./index.ts";

const props = defineProps<{
  old: string;
  now: string;
}>();

const mode = ref<"unified" | "split">("unified");

const diffedLines = computed<DiffedLine[]>(() => {
  const changes = diffLines(props.old, props.now);
  const result: DiffedLine[] = [];

  let oldLineNum = 1;
  let newLineNum = 1;

  for (const change of changes) {
    const lines = change.value.split("\n");
    if (lines[lines.length - 1] === "") lines.pop();

    for (const line of lines) {
      if (change.added) {
        result.push({
          type: "added",
          oldLineNumber: undefined,
          newLineNumber: newLineNum++,
          content: line,
        });
      } else if (change.removed) {
        result.push({
          type: "removed",
          oldLineNumber: oldLineNum++,
          newLineNumber: undefined,
          content: line,
        });
      } else {
        result.push({
          type: "unchanged",
          oldLineNumber: oldLineNum++,
          newLineNumber: newLineNum++,
          content: line,
        });
      }
    }
  }

  return result;
});
</script>

<template>
  <DiffBoxUnified v-if="mode === 'unified'" :diffed-lines="diffedLines" />
  <DiffBoxSplit v-else :diffed-lines="diffedLines" />
</template>
