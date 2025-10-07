<script setup lang="ts">
import { storeToRefs } from "pinia";
import { usePageContext } from "vike-vue/usePageContext";
import type { Project } from "@cat/shared/schema/drizzle/project";
import Header from "./headless/HHeader.vue";
import ProjectBreadcrumb from "./ProjectBreadcrumb.vue";
import HButton from "./headless/HButton.vue";
import { useSidebarStore } from "@/app/stores/sidebar.ts";

defineProps<{
  project: Project;
}>();

const { isFolding } = storeToRefs(useSidebarStore());

const ctx = usePageContext();
</script>

<template>
  <Header
    :classes="{
      header: 'header',
    }"
  >
    <HButton
      :classes="{
        base: 'btn btn-md btn-transparent btn-square',
      }"
      icon="i-mdi:menu"
      class="font-bold md:hidden"
      @click.stop="isFolding = !isFolding"
    />
    <ProjectBreadcrumb v-if="project" :project />
    <div v-else class="text-lg font-500 flex items-center">
      {{ ctx.user?.name }}
    </div>
  </Header>
</template>
