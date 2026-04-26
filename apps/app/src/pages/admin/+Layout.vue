<script setup lang="ts">
import Header from "./Header.vue";
import Sidebar from "./Sidebar.vue";
</script>

<template>
  <div class="flex h-full w-full flex-col md:flex-row">
    <Sidebar />
    <div class="flex h-full w-full flex-col overflow-y-auto">
      <Header />
      <div class="flex flex-col gap-2 p-4">
        <slot />
      </div>
    </div>
  </div>
</template>
