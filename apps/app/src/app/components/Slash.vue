<script setup lang="ts">
const props = defineProps<{
  large?: boolean;
}>();
</script>

<template>
  <span
    class="i-mdi:slash-forward text-gray-500 inline-block"
    :class="{
      'h-6 w-6': large,
    }"
  ></span>
</template>
