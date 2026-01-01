<script setup lang="ts">
import Sidebar from "./Sidebar.vue";
import Header from "./Header.vue";
</script>

<template>
  <div class="flex flex-col h-full w-full md:flex-row">
    <Sidebar />
    <div class="flex flex-col h-full w-full overflow-y-auto">
      <Header />
      <div class="p-4 flex flex-col gap-2">
        <slot />
      </div>
    </div>
  </div>
</template>
