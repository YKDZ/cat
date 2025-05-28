<script setup lang="ts">
import IndexHeader from "../components/IndexHeader.vue";
import IndexSidebar from "../components/IndexSidebar.vue";
</script>

<template>
  <div class="flex flex-col h-full w-full md:flex-row">
    <IndexSidebar />
    <div class="flex flex-col h-full w-full overflow-y-auto">
      <IndexHeader />
      <!-- Content -->
      <div class="p-4 flex flex-col gap-2">
        <slot />
      </div>
    </div>
  </div>
</template>
