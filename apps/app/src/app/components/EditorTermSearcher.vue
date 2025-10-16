<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";
import HInput from "@/app/components/headless/form/HInput.vue";
import { useEditorTermStore } from "@/app/stores/editor/term.ts";

const { t } = useI18n();

const { searchQuery } = storeToRefs(useEditorTermStore());
const { searchTerm } = useEditorTermStore();

const handleSearch = () => {
  searchTerm();
};
</script>

<template>
  <HInput
    v-model="searchQuery"
    icon="icon-[mdi--magnify]"
    :placeholder="t('搜索术语')"
    :classes="{
      input: 'input input-md',
      'input-container': 'input-container rounded-md',
      'input-icon': 'input-icon',
    }"
    @change="handleSearch"
  />
</template>
