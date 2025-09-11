<script setup lang="ts">
import { storeToRefs } from "pinia";
import { usePageContext } from "vike-vue/usePageContext";
import { useSidebarStore } from "../stores/sidebar";
import Header from "./Header.vue";
import ProjectBreadcrumb from "./ProjectBreadcrumb.vue";
import type { Project } from "@cat/shared/schema/prisma/project";
import HButton from "./headless/HButton.vue";

const { isFolding } = storeToRefs(useSidebarStore());

const ctx = usePageContext();

const props = defineProps<{
  project: Project;
}>();
</script>

<template>
  <Header>
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
