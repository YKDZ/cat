<script setup lang="ts">
import type { Glossary } from "@cat/shared/schema/drizzle/glossary";
import GlossaryBreadcrumb from "./GlossaryBreadcrumb.vue";
import { SidebarTrigger } from "@/app/components/ui/sidebar";

defineProps<{
  glossary: Glossary;
}>();
</script>

<template>
  <div class="header">
    <SidebarTrigger sidebar-id="index" />
    <GlossaryBreadcrumb :glossary />
  </div>
</template>
