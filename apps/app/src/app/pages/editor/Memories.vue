<script setup lang="ts">
import { useI18n } from "vue-i18n";
import MemoryList from "./MemoryList.vue";
import MemorySettings from "./MemorySettings.vue";

const { t } = useI18n();
</script>

<template>
  <div class="flex flex-col gap-2 p-3 pb-0">
    <h3 class="text-sm font-bold inline-flex gap-2 items-center">
      <span> {{ t("翻译记忆") }}</span>
      <MemorySettings />
    </h3>
    <MemoryList />
  </div>
</template>
