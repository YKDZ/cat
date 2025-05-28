<script setup lang="ts">
import { vOnClickOutside } from "@vueuse/components";

const isOpen = defineModel<boolean>("isOpen", { default: false });

const handleClickOutside = () => {
  isOpen.value = false;
};
</script>

<template>
  <Teleport to="#teleported">
    <div
      v-if="isOpen"
      class="bg-black bg-op-20 flex h-screen w-screen items-center left-0 top-0 justify-center fixed z-60"
    >
      <div v-on-click-outside="handleClickOutside"><slot /></div></div
  ></Teleport>
</template>
