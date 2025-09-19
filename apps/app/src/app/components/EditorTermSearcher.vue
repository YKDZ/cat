<script setup lang="ts">
import { storeToRefs } from "pinia";
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useEditorStore } from "@/app/stores/editor.ts";
import { trpc } from "@cat/app-api/trpc/client";
import { useToastStore } from "@/app/stores/toast.ts";
import HInput from "@/app/components/headless/HInput.vue";

const { t } = useI18n();
const { info, warn } = useToastStore();

const { languageFromId, languageToId, elementId } =
  storeToRefs(useEditorStore());
const { addTerms } = useEditorStore();

const searchQuery = ref("");

const handleSearchInput = async () => {
  handleSearch(searchQuery.value).then((amount) => {
    if (amount !== 0) searchQuery.value = "";
  });
};

const handleSearch = async (text: string) => {
  if (!languageFromId.value || !languageToId.value) return 0;

  if (text.length === 0) {
    warn(t("不能搜索空术语"));
    return 0;
  }

  return await trpc.glossary.searchTerm
    .query({
      text,
      termLanguageId: languageFromId.value,
      translationLanguageId: languageToId.value,
    })
    .then((ts) => {
      addTerms(...ts);
      if (ts.length !== 0) {
        info(`用 ${text} 搜索到 ${ts.length} 条术语`);
      } else {
        info(`用 ${text} 没有搜索到任何术语`);
      }
      return ts.length;
    });
};

watch(elementId, () => (searchQuery.value = ""));
</script>

<template>
  <HInput
    v-model="searchQuery"
    icon="i-mdi:magnify"
    :placeholder="$t('搜索术语')"
    :classes="{
      input: 'input input-md',
      'input-container': 'input-container rounded-md',
      'input-icon': 'input-icon',
    }"
    @change="handleSearchInput"
  />
</template>
