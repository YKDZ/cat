<script setup lang="ts">
import { useI18n } from "vue-i18n";
import GhostTextSettings from "./GhostTextSettings.vue";
import MemoryList from "./MemoryList.vue";
import MemorySettings from "./MemorySettings.vue";

const { t } = useI18n();
</script>

<template>
  <div class="flex flex-col gap-2 p-3 pb-0">
    <h3 class="inline-flex items-center gap-2 text-sm font-bold">
      <span> {{ t("翻译记忆") }}</span>
      <MemorySettings />
      <GhostTextSettings />
    </h3>
    <MemoryList />
  </div>
</template>
