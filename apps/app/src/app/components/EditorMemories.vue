<script setup lang="ts">
import EditorMemoryList from "./EditorMemoryList.vue";
import EditorMemorySettings from "./EditorMemorySettings.vue";
</script>

<template>
  <div class="flex flex-col gap-2">
    <h3 class="text-sm font-bold inline-flex gap-2 items-center">
      <span> {{ $t("翻译记忆") }}</span>
      <EditorMemorySettings />
    </h3>
    <EditorMemoryList />
  </div>
</template>
