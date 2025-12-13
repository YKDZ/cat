<script setup lang="ts">
import type { Memory } from "@cat/shared/schema/drizzle/memory";
import MemoryBreadcrumb from "./MemoryBreadcrumb.vue";
import { SidebarTrigger } from "@/app/components/ui/sidebar";

defineProps<{
  memory: Memory;
}>();
</script>

<template>
  <div class="header">
    <SidebarTrigger sidebar-id="index" />
    <MemoryBreadcrumb :memory />
  </div>
</template>
