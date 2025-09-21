<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";
import HInput from "@/app/components/headless/form/HInput.vue";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";

const { t } = useI18n();

const { searchQuery } = storeToRefs(useEditorTableStore());
const { toPage } = useEditorTableStore();

const handleSearch = () => {
  toPage(0);
};
</script>

<template>
  <HInput
    v-model.trim="searchQuery"
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
