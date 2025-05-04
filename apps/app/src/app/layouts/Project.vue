<script setup lang="ts">
import IndexSidebar from "../components/IndexSidebar.vue";
import ProjectHeader from "../components/ProjectHeader.vue";
</script>

<template>
  <div class="flex flex-col h-full w-full md:flex-row">
    <IndexSidebar />
    <div class="flex flex-col h-full w-full">
      <ProjectHeader />
      <!-- Content -->
      <div class="p-4 flex flex-col gap-2">
        <slot />
      </div>
    </div>
  </div>
</template>
