<script setup lang="ts">
defineProps<{
  large?: boolean;
}>();
</script>

<template>
  <span
    class="i-mdi:slash-forward text-highlight-content aspect-square inline-block"
    :class="{
      'h-6 w-6': large,
    }"
  ></span>
</template>
