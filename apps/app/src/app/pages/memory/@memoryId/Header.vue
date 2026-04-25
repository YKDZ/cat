<script setup lang="ts">
import type { Memory } from "@cat/shared";

import { SidebarTrigger } from "@cat/ui";

import Breadcrumb from "./Breadcrumb.vue";

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
