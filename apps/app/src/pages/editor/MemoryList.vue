<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";

import { useEditorMemoryStore } from "@/stores/editor/memory.ts";
import { useEditorTableStore } from "@/stores/editor/table.ts";
import { useProfileStore } from "@/stores/profile.ts";
import { watchClient, watchClientThrottled } from "@/utils/vue.ts";

import MemoryListItem from "./MemoryListItem.vue";

const { t } = useI18n();

const { memories, error } = storeToRefs(useEditorMemoryStore());
const { elementId } = storeToRefs(useEditorTableStore());
const { subMemories, unsubscribe } = useEditorMemoryStore();
const { editorMemoryMinConfidence } = storeToRefs(useProfileStore());

watchClient(
  elementId,
  async () => {
    await unsubscribe();
    await subMemories();
  },
  {
    immediate: true,
  },
);

watchClientThrottled(editorMemoryMinConfidence, subMemories);
</script>

<template>
  <div v-if="error" class="px-3 py-2 text-sm text-destructive">
    {{ t("辅助信息加载失败") }}
  </div>
  <MemoryListItem
    v-for="(memory, index) in memories"
    :key="memory.id"
    :index
    :memory-suggestion="memory"
  />
  <div v-if="memories.length === 0" class="flex flex-col gap-1 px-3 py-2">
    {{ t("还没有可用的记忆") }}
  </div>
</template>
