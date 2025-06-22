<script setup lang="ts">
import EditorTermList from "./EditorTermList.vue";
import EditorTermSearcher from "./EditorTermSearcher.vue";
</script>

<template>
  <div class="flex flex-col gap-2">
    <h3 class="text-sm font-bold">{{ $t("术语") }}</h3>
    <EditorTermSearcher />
    <EditorTermList />
  </div>
</template>
