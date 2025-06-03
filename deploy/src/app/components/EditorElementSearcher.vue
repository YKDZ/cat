<script setup lang="ts">
import Input from "./Input.vue";
import { storeToRefs } from "pinia";
import { useEditorStore } from "../stores/editor";

const { searchQuery } = storeToRefs(useEditorStore());
const { refresh, fetchElementTotalAmount, toPage } = useEditorStore();

const handleSearch = async () => {
  refresh();
  await fetchElementTotalAmount();
  await toPage(0);
};
</script>

<template>
  <Input
    v-model="searchQuery"
    icon="i-mdi:magnify"
    full-width
    placeholder="搜索可翻译元素"
    @change="handleSearch"
  />
</template>
