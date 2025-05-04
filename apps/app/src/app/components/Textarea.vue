<script setup lang="ts">
const modalValue = defineModel({ type: String });
</script>

<template>
  <textarea
    v-model="modalValue"
    class="p-3 max-w-2/3 min-h-6 select-none focus-visible:(outline-0 ring-1 ring-gray-200 ring-offset-transparent ring-offset-1)"
  />
</template>
