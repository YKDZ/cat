<script setup lang="ts">
import "virtual:uno.css";
import Toast from "@/app/components/Toast.vue";
import { onBeforeMount, onMounted, watch } from "vue";
import { useLanguageStore } from "@/app/stores/language";
import { usePageContext } from "vike-vue/usePageContext";
import { useUserStore } from "@/app/stores/user";
import { storeToRefs } from "pinia";

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

const ctx = usePageContext();

watch(
  () => ctx.user,
  (to) => {
    storeToRefs(useUserStore()).user.value = to;
  },
  { immediate: true },
);

onBeforeMount(() => {});

onMounted(() => {
  useLanguageStore().update();
});
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
