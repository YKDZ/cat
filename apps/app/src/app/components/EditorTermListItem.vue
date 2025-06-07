<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useEditorStore } from "../stores/editor";
import { useToastStore } from "../stores/toast";
import Render from "./formater/Render.vue";
import Icon from "./Icon.vue";
import type { Glossary, Term, TermRelation } from "@cat/shared";
import { onMounted, ref } from "vue";
import { trpc } from "@/server/trpc/client";

const props = defineProps<{
  term: TermRelation;
}>();

const { info } = useToastStore();
const { insert } = useEditorStore();
const { document } = storeToRefs(useEditorStore());

const handleInsert = (translation: Term) => {
  insert(translation.value);
  info(`成功插入术语`);
};

const glossary = ref<Glossary | null>(null);

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
      @click="handleInsert(term.Translation!)"
    >
      <Render v-if="document" :text="term.Term!.value" />
      <Icon small icon="i-mdi:arrow-right" />
      <Render v-if="document" :text="term.Translation!.value" />
    </button>
    <span v-if="glossary" class="text-sm text-highlight-content">{{
      glossary.name
    }}</span>
  </div>
</template>
