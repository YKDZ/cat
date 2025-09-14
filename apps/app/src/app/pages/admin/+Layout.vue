<script setup lang="ts">
import AdminHeader from "../components/AdminHeader.vue";
import AdminSidebar from "../components/AdminSidebar.vue";
</script>

<template>
  <div class="flex flex-col h-full w-full md:flex-row">
    <AdminSidebar />
    <div class="flex flex-col h-full w-full overflow-y-auto">
      <AdminHeader />
      <!-- Content -->
      <div class="p-4 flex flex-col gap-2">
        <slot />
      </div>
    </div>
  </div>
</template>
