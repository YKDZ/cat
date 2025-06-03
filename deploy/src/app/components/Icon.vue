<script setup lang="ts">
const props = defineProps<{
  icon: string;
  small?: boolean;
}>();
</script>

<template>
  <span
    class="inline-block"
    :class="[
      {
        'min-h-4 min-w-4': small,
        'min-h-6 min-w-6': !small,
      },
      icon,
    ]"
  ></span>
</template>
