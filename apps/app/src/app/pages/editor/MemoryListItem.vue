<script setup lang="ts">
import { toShortFixed } from "@cat/shared/utils";
import type { Memory } from "@cat/shared/schema/drizzle/memory";
import type { MemorySuggestion } from "@cat/shared/schema/misc";
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { orpc } from "@/server/orpc";
import TextTagger from "@/app/components/tagger/TextTagger.vue";
import UserAvatar from "@/app/components/UserAvatar.vue";
import { useHotKeys } from "@/app/utils/magic-keys.ts";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";

const { replace } = useEditorTableStore();
const { t } = useI18n();

const props = defineProps<{
  memorySuggestion: MemorySuggestion;
  index: number;
}>();

const handleCopy = () => {
  replace(props.memorySuggestion.translation);
};

const memory = ref<Memory | null>(null);

useHotKeys(`M+${props.index + 1}`, handleCopy);

onMounted(async () => {
  memory.value = await orpc.memory.get({
    memoryId: props.memorySuggestion.memoryId,
  });
});
</script>

<template>
  <div class="px-3 py-2 flex flex-col gap-1 hover:bg-background">
    <button class="text-start cursor-pointer text-wrap" @click="handleCopy">
      <TextTagger :text="memorySuggestion.translation" />
    </button>
    <div class="text-sm text-foreground flex gap-2 items-center">
      <span>{{
        t("{similarity}%", {
          similarity: toShortFixed(memorySuggestion.similarity * 100, 2),
        })
      }}</span>
      <UserAvatar :user-id="memorySuggestion.creatorId" with-name :size="16" />
      <span>{{ memory?.name ?? props.memorySuggestion.memoryId }}</span>
    </div>
  </div>
</template>
