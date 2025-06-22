<script setup lang="ts">
import logoURL from "@/assets/logo.png";
import { usePageContext } from "vike-vue/usePageContext";

const ctx = usePageContext();
</script>

<template>
  <div class="flex gap-3 items-center">
    <img :src="logoURL" alt="Logo" class="h-6 w-6" /><span
      class="text-lg font-bold"
      >{{ ctx.name }}</span
    >
  </div>
</template>
