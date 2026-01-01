<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";
import MemoryListItem from "./MemoryListItem.vue";
import { useEditorMemoryStore } from "@/app/stores/editor/memory.ts";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";
import { watchClient, watchClientThrottled } from "@/app/utils/vue.ts";
import { useProfileStore } from "@/app/stores/profile.ts";

const { t } = useI18n();

const { memories } = storeToRefs(useEditorMemoryStore());
const { elementId } = storeToRefs(useEditorTableStore());
const { subMemories, unsubscribe } = useEditorMemoryStore();
const { editorMemoryMinSimilarity } = storeToRefs(useProfileStore());

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

watchClientThrottled(editorMemoryMinSimilarity, subMemories);
</script>

<template>
  <MemoryListItem
    v-for="(memory, index) in memories"
    :key="memory.translation"
    :index
    :memory-suggestion="memory"
  />
  <div v-if="memories.length === 0" class="px-3 py-2 flex flex-col gap-1">
    {{ t("还没有可用的记忆") }}
  </div>
</template>
