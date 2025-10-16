<script setup lang="ts">
import Toast from "@/app/components/Toast.vue";

// icon-[mdi--numeric-1-circle-outline]
// icon-[mdi--numeric-2-circle-outline]
// icon-[mdi--numeric-3-circle-outline]
// icon-[mdi--numeric-4-circle-outline]
// icon-[mdi--numeric-5-circle-outline]
// icon-[mdi--numeric-6-circle-outline]
// icon-[mdi--numeric-7-circle-outline]
// icon-[mdi--numeric-8-circle-outline]
// icon-[mdi--numeric-9-circle-outline]
// icon-[mdi--numeric-10-circle-outline]
// icon-[file-icons--markdownlint]
// icon-[file-icons--yaml-alt4]
// icon-[mdi--code-json]
</script>

<template>
  <div
    class="bg-highlight h-screen max-h-screen max-w-screen min-h-screen min-w-screen w-screen overflow-x-hidden overflow-y-auto"
  >
    <slot />
  </div>
  <Toast />
</template>
