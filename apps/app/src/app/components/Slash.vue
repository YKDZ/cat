<script setup lang="ts">
defineProps<{
  large?: boolean;
}>();
</script>

<template>
  <span
    class="icon-[mdi--slash-forward] text-foreground aspect-square inline-block"
    :class="{
      'h-6 w-6': large,
    }"
  ></span>
</template>
