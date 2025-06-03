<script setup lang="ts"></script>

<template>
  <th
    class="font-bold px-4 text-left align-middle h-12 [&:has([role=checkbox])]:pr-0"
  >
    <div class="flex gap-0.5 whitespace-nowrap items-center">
      <slot />
    </div>
  </th>
</template>
