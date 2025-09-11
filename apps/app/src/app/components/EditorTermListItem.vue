<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useEditorStore } from "@/app/stores/editor";
import { useToastStore } from "@/app/stores/toast";
import TextTagger from "./tagger/TextTagger.vue";
import Icon from "./Icon.vue";
import type {
  Glossary,
  Term,
  TermRelation,
} from "@cat/shared/schema/prisma/glossary";
import { onMounted, ref } from "vue";
import { trpc } from "@/server/trpc/client";
import { useI18n } from "vue-i18n";
import { useHotKeys } from "@/app/utils/magic-keys";

const props = defineProps<{
  term: TermRelation;
  index: number;
}>();

const { t } = useI18n();
const { info } = useToastStore();
const { insert } = useEditorStore();
const { document } = storeToRefs(useEditorStore());

const handleInsert = () => {
  insert(props.term!.Translation!.value);
  info(t("成功插入术语"));
};

const glossary = ref<Glossary | null>(null);

useHotKeys(`T+${props.index + 1}`, handleInsert);

onMounted(() => {
  if (!props.term.Term) return;

  trpc.glossary.query
    .query({
      id: props.term.Term.glossaryId,
    })
    .then((glo) => (glossary.value = glo));
});
</script>

<template>
  <div class="px-3 py-2 flex flex-col gap-1 hover:bg-highlight-darker">
    <button
      class="text-start flex gap-1 cursor-pointer text-wrap items-center"
      @click="handleInsert"
    >
      <TextTagger v-if="document" :text="term.Term!.value" />
      <Icon small icon="i-mdi:arrow-right" />
      <TextTagger v-if="document" :text="term.Translation!.value" />
    </button>
    <span v-if="glossary" class="text-sm text-highlight-content">{{
      glossary.name
    }}</span>
  </div>
</template>
