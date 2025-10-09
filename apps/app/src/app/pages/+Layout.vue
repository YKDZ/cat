<script setup lang="ts">
import "virtual:uno.css";
import Toast from "@/app/components/Toast.vue";

// i-mdi:numeric-1-circle-outline
// i-mdi:numeric-2-circle-outline
// i-mdi:numeric-3-circle-outline
// i-mdi:numeric-4-circle-outline
// i-mdi:numeric-5-circle-outline
// i-mdi:numeric-6-circle-outline
// i-mdi:numeric-7-circle-outline
// i-mdi:numeric-8-circle-outline
// i-mdi:numeric-9-circle-outline
// i-mdi:numeric-10-circle-outline
// i-file-icons:markdownlint
// i-file-icons:yaml-alt4
// i-mdi:code-json

const a = "b";
</script>

<template>
  <div
    class="bg-highlight h-screen max-h-screen max-w-screen min-h-screen min-w-screen w-screen overflow-x-hidden overflow-y-auto"
  >
    <slot />
  </div>
  <Toast />
</template>

<style>
@import url("../assets/theme.css");
</style>
