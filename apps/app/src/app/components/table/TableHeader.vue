<script setup lang="ts">
import TableRow from "./TableRow.vue";
</script>

<template>
  <thead class="[&_tr]:border-b">
    <TableRow>
      <slot />
    </TableRow>
  </thead>
</template>
