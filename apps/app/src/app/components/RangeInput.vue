<script setup lang="ts">
const modelValue = defineModel<number>({
  default: 0,
  set(value) {
    return Number(value) || 0;
  },
});
</script>

<template>
  <input v-model.number="modelValue" type="range" />
</template>
