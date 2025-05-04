<script setup lang="ts">
import { usePageContext } from "vike-vue/usePageContext";
import Header from "./Header.vue";
import { ref, watch } from "vue";
import Slash from "./Slash.vue";
import Button from "./Button.vue";
import { storeToRefs } from "pinia";
import { useSidebarStore } from "../stores/sidebar";
import { useProjectStore } from "../stores/project";
import { Project } from "@cat/shared";
import ProjectBreadcrumb from "./ProjectBreadcrumb.vue";

const { isFolding } = storeToRefs(useSidebarStore());

const ctx = usePageContext();

const { projects } = storeToRefs(useProjectStore());

const project = ref<Project | null>(null);

watch(
  () => ctx.routeParams,
  () => {
    project.value =
      projects.value.find(
        (project) => project.id === ctx.routeParams.projectId,
      ) ?? null;
  },
  { immediate: true },
);
</script>

<template>
  <Header
    ><Button
      transparent
      no-text
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
