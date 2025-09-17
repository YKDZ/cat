<script setup lang="ts">
import AdminSidebar from "@/app/components/AdminSidebar.vue";
import AdminHeader from "@/app/components/AdminHeader.vue";
</script>

<template>
  <div class="flex flex-col h-full w-full md:flex-row">
    <AdminSidebar />
    <div class="flex flex-col h-full w-full overflow-y-auto">
      <AdminHeader />
      <div class="p-4 flex flex-col gap-2">
        <slot />
      </div>
    </div>
  </div>
</template>
