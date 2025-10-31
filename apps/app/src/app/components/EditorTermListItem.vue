<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";
import TextTagger from "./tagger/TextTagger.vue";
import Icon from "./Icon.vue";
import { useToastStore } from "@/app/stores/toast.ts";
import { useHotKeys } from "@/app/utils/magic-keys.ts";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";
import { useEditorContextStore } from "@/app/stores/editor/context.ts";

const props = defineProps<{
  term: { term: string; translation: string };
  index: number;
}>();

const { t } = useI18n();
const { info } = useToastStore();
const { insert } = useEditorTableStore();
const { document } = storeToRefs(useEditorContextStore());

const handleInsert = () => {
  insert(props.term.term);
  info(t("成功插入术语"));
};

useHotKeys(`T+${props.index + 1}`, handleInsert);
</script>

<template>
  <div class="px-3 py-2 flex flex-col gap-1 hover:bg-highlight-darker">
    <button
      class="text-start flex gap-1 cursor-pointer text-wrap items-center"
      @click="handleInsert"
    >
      <TextTagger v-if="document" :text="term.term" />
      <Icon small icon="icon-[mdi--arrow-right]" />
      <TextTagger v-if="document" :text="term.translation" />
    </button>
  </div>
</template>
