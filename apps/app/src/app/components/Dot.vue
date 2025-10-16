<script setup lang="ts">
defineProps<{
  large?: boolean;
}>();
</script>

<template>
  <span
    class="icon-[mdi--circle-small] text-highlight-content inline-block"
    :class="{
      'h-6 w-6': large,
    }"
  ></span>
</template>
