<script setup lang="ts">
import type { Glossary } from "@cat/shared/schema/drizzle/glossary";
import Breadcrumb from "./Breadcrumb.vue";
import { SidebarTrigger } from "@/app/components/ui/sidebar";

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
