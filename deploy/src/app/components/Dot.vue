<script setup lang="ts">
const props = defineProps<{
  large?: boolean;
}>();
</script>

<template>
  <span
    class="i-mdi:circle-small text-highlight-content inline-block"
    :class="{
      'h-6 w-6': large,
    }"
  ></span>
</template>
