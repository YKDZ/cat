<script setup lang="ts">
import logoURL from "@/app/assets/logo.png";
import { usePageContext } from "vike-vue/usePageContext";
import { navigate } from "vike/client/router";

const props = defineProps({
  link: Boolean,
});

const ctx = usePageContext();

const handleClick = async () => {
  if (props.link) {
    await navigate(`/`);
  }
};
</script>

<template>
  <!-- Logo -->
  <div
    class="px-2 text-center rounded-sm inline-flex gap-3 h-full w-full select-none items-center"
    :class="{
      'cursor-pointer hover:bg-highlight-darker': link,
    }"
    @click="handleClick"
  >
    <img :src="logoURL" alt="Logo" class="h-6 w-6" />
    <span class="font-bold">{{ ctx.name }}</span>
  </div>
</template>
