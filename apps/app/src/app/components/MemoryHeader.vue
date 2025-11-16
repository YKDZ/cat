<script setup lang="ts">
import type { Memory } from "@cat/shared/schema/drizzle/memory";
import type { User } from "@cat/shared/schema/drizzle/user";
import MemoryBreadcrumb from "./MemoryBreadcrumb.vue";
import { SidebarTrigger } from "@/app/components/ui/sidebar";

defineProps<{
  memory: Memory & {
    Creator: User;
  };
}>();
</script>

<template>
  <div class="header">
    <SidebarTrigger sidebar-id="index" />
    <MemoryBreadcrumb :memory />
  </div>
</template>
