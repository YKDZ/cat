<script setup lang="ts">
import type { Glossary } from "@cat/shared";

import { SidebarTrigger } from "@cat/ui";

import Breadcrumb from "./Breadcrumb.vue";

defineProps<{
  glossary: Pick<Glossary, "name" | "creatorId">;
}>();
</script>

<template>
  <div class="header">
    <SidebarTrigger sidebar-id="index" />
    <Breadcrumb :glossary />
  </div>
</template>
