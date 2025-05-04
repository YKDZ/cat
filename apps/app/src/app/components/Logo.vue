<script setup lang="ts">
import logoURL from "@/app/assets/logo.png";
import { navigate } from "vike/client/router";

const props = defineProps({
  link: Boolean,
});
</script>

<template>
  <!-- Logo -->
  <div
    class="px-2 text-center rounded-sm inline-flex gap-3 h-full w-full select-none items-center"
    :class="{
      'cursor-pointer hover:bg-gray-200': link,
    }"
    @click="link && navigate(`/`)"
  >
    <img :src="logoURL" alt="Logo" class="h-6 w-6" />
    <span class="font-bold">CAT</span>
  </div>
</template>
