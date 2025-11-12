<script setup lang="ts">
defineProps<{
  large?: boolean;
}>();
</script>

<template>
  <span
    class="icon-[mdi--circle-small] text-foreground inline-block"
    :class="{
      'h-6 w-6': large,
    }"
  ></span>
</template>
