<script setup lang="ts">
import type { Memory } from "@cat/shared/schema/drizzle/memory";
import Breadcrumb from "./Breadcrumb.vue";
import { SidebarTrigger } from "@/app/components/ui/sidebar";

defineProps<{
  memory: Pick<Memory, "name" | "creatorId">;
}>();
</script>

<template>
  <div class="header">
    <SidebarTrigger sidebar-id="index" />
    <Breadcrumb :memory />
  </div>
</template>
