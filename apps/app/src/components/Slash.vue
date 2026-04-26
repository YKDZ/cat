<script setup lang="ts">
defineProps<{
  large?: boolean;
}>();
</script>

<template>
  <span
    class="icon-[mdi--slash-forward] inline-block aspect-square text-foreground"
    :class="{
      'h-6 w-6': large,
    }"
  ></span>
</template>
