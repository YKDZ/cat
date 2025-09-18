<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed } from "vue";
import * as z from "zod/v4";
import Collapse from "./Collapse.vue";
import { useEditorStore } from "@/app/stores/editor.ts";

const { element } = storeToRefs(useEditorStore());

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
  <Collapse
    :text="$t('元数据')"
    text-classes="font-bold text-sm"
    class="bottom-3 left-3 absolute"
  >
    <div class="flex flex-col gap-2">
      <div v-for="key in keys" :key class="text-sm text-nowrap">
        <span
          class="mr-1 px-2 py-1 rounded-sm bg-highlight-darker select-none"
          >{{ key }}</span
        >{{ meta[key] }}
      </div>
    </div>
  </Collapse>
</template>
