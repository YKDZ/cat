<script setup lang="ts">
import HToggle from "../headless/HToggle.vue";

const modelValue = defineModel<boolean>();

const emit = defineEmits<{
  update: [value: boolean];
  click: [event: Event];
}>();
</script>

<template>
  <HToggle
    v-model="modelValue"
    :classes="{
      'base-checked': 'toggle toggle-md toggle-base',
      'base-unchecked': 'toggle toggle-md toggle-highlight-darker',
      'thumb-checked':
        'toggle-thumb toggle-thumb-md toggle-thumb-highlight toggle-thumb-checked',
      'thumb-unchecked': 'toggle-thumb toggle-thumb-md toggle-thumb-highlight',
    }"
    @click="emit('click', $event)"
    @update="(value) => emit('update', value)"
  />
</template>
