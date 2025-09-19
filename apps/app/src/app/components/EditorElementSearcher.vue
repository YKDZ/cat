<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";
import { useEditorStore } from "@/app/stores/editor.ts";
import HInput from "@/app/components/headless/form/HInput.vue";

const { t } = useI18n();

const { searchQuery } = storeToRefs(useEditorStore());
const { refresh, fetchElementTotalAmount, toPage } = useEditorStore();

const handleSearch = async () => {
  refresh();
  await fetchElementTotalAmount();
  await toPage(0);
};
</script>

<template>
  <HInput
    v-model="searchQuery"
    icon="i-mdi:magnify"
    :placeholder="t('搜索可翻译元素')"
    type="text"
    :classes="{
      input: 'input input-md',
      'input-container': 'input-container rounded-md',
      'input-icon': 'input-icon',
    }"
    @change="handleSearch"
  />
</template>
