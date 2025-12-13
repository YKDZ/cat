<script setup lang="ts">
import { inject } from "vue";
import DocumentBreadcrumb from "./DocumentBreadcrumb.vue";
import { documentKey } from "@/app/utils/provide.ts";
import { SidebarTrigger } from "@/app/components/ui/sidebar";

const document = inject(documentKey)!;
</script>

<template>
  <div class="header">
    <SidebarTrigger sidebar-id="index" />
    <DocumentBreadcrumb :document />
  </div>
</template>
