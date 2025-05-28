<script setup lang="ts">
const modalValue = defineModel({ type: String });
</script>

<template>
  <textarea
    v-model="modalValue"
    class="p-3 outline-0 min-h-6rem select-none ring-1 ring-highlight-darkest ring-offset-transparent focus-visible:ring-base"
  />
</template>
