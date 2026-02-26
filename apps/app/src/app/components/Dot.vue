<script setup lang="ts">
defineProps<{
  large?: boolean;
}>();
</script>

<template>
  <span
    class="icon-[mdi--circle-small] inline-block text-foreground"
    :class="{
      'h-6 w-6': large,
    }"
  ></span>
</template>
