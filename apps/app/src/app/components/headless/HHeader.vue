<script setup lang="ts">
type Classes = {
  header?: string;
};

defineProps<{
  classes?: Classes;
}>();
</script>

<template>
  <div :class="[classes?.header]">
    <slot />
  </div>
</template>
