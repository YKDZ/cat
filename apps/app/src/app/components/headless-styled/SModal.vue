<script setup lang="ts">
import HModal from "../headless/HModal.vue";

const isOpen = defineModel<boolean>();
</script>

<template>
  <HModal
    v-model="isOpen"
    :classes="{
      modal: 'px-6 py-2 rounded-md bg-highlight',
      'modal-backdrop':
        'bg-black/20 flex h-screen w-screen items-center left-0 top-0 justify-center fixed z-60',
    }"
    ><slot
  /></HModal>
</template>
