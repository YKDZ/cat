<script setup lang="ts">
import { storeToRefs } from "pinia";
import { watch } from "vue";
import { useI18n } from "vue-i18n";
import EditorTermListItem from "./EditorTermListItem.vue";
import { trpc } from "@/server/trpc/client.ts";
import { useEditorStore } from "@/app/stores/editor.ts";
import { useToastStore } from "@/app/stores/toast.ts";

const { t } = useI18n();

const { trpcWarn } = useToastStore();
const { elementId, languageToId, terms } = storeToRefs(useEditorStore());

const load = () => {
  if (!elementId.value || !languageToId.value) return;

  trpc.glossary.findTerm
    .query({
      elementId: elementId.value,
      translationLanguageId: languageToId.value,
    })
    .then((ts) => {
      terms.value = ts;
    })
    .catch(trpcWarn);
};

watch(elementId, load, { immediate: true });
</script>

<template>
  <div class="flex flex-col gap-1">
    <EditorTermListItem
      v-for="(term, index) in terms"
      :key="term.Term!.id"
      :index
      :term
    />
    <div v-if="terms.length === 0" class="px-3 py-2">
      {{ t("还没有可用的术语") }}
    </div>
  </div>
</template>
