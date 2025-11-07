<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed } from "vue";
import * as z from "zod/v4";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";
import { useI18n } from "vue-i18n";

const { element } = storeToRefs(useEditorTableStore());

const meta = computed(() => {
  if (!element.value) return {} as Record<string, unknown>;
  return z.record(z.string(), z.unknown()).parse(element.value.meta);
});

const keys = computed(() => {
  const editorDisplay = meta.value["editor-display"];
  if (editorDisplay && z.array(z.string()).parse(editorDisplay))
    return z
      .array(z.string())
      .parse(editorDisplay)
      .filter((key) => meta.value[key] !== null)
      .sort();
  return Object.keys(meta.value)
    .filter((key) => meta.value[key] !== null)
    .sort();
});
</script>

<template>
  <div class="flex flex-col gap-1 overflow-y-auto">
    <div v-for="key in keys" :key="key">
      <span class="mr-1 px-2 py-1 rounded-sm bg-highlight-darker select-none">{{
        key
      }}</span
      >{{ meta[key] }}
    </div>
  </div>
</template>
