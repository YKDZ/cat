<script setup lang="ts">
import { storeToRefs } from "pinia";
import Input from "./Input.vue";
import { useEditorStore } from "../stores/editor";
import { ref, watch } from "vue";
import Button from "./Button.vue";
import { trpc } from "@/server/trpc/client";
import { useToastStore } from "../stores/toast";

const { info, warn } = useToastStore();

const { languageFromId, languageToId, elementId } =
  storeToRefs(useEditorStore());
const { addTerms } = useEditorStore();

const searchQuery = ref("");

const handleSearchSelection = async () => {
  if (!languageFromId.value || !languageToId.value) return;

  const selectionContent = window.getSelection()?.toString() ?? "";

  if (selectionContent.trim().length === 0) {
    warn("不能搜索空术语");
    return;
  }

  await handleSearch(selectionContent);
};

const handleSearchInput = async () => {
  handleSearch(searchQuery.value).then((amount) => {
    if (amount !== 0) searchQuery.value = "";
  });
};

const handleSearch = async (text: string) => {
  if (!languageFromId.value || !languageToId.value) return 0;

  if (text.length === 0) {
    warn("不能搜索空术语");
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
  <Input
    v-model="searchQuery"
    icon="i-mdi:magnify"
    placeholder="搜索术语"
    full-width
    @change="handleSearchInput"
  />
  <Button
    magic-key="Shift+T"
    class="hidden"
    @magic-click="handleSearchSelection"
  />
</template>
