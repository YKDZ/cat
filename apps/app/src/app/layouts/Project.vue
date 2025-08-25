<script setup lang="ts">
import type { Project } from "@cat/shared";
import IndexSidebar from "../components/IndexSidebar.vue";
import ProjectHeader from "../components/ProjectHeader.vue";
import ProjectNavbar from "../components/ProjectNavbar.vue";
import { provide, ref, watch } from "vue";
import { usePageContext } from "vike-vue/usePageContext";
import { useProjectStore } from "../stores/project";
import { storeToRefs } from "pinia";
import { projectKey } from "../utils/provide";

const ctx = usePageContext();

const project = ref<Project | null>(null);

provide(projectKey, project);

const { projects } = useProjectStore();

const updateProject = () => {
  project.value =
    projects.find((project) => project.id === ctx.routeParams.projectId) ??
    null;
};

watch(() => ctx.routeParams, updateProject, { immediate: true });

watch(storeToRefs(useProjectStore()).projects, updateProject, {
  immediate: true,
});
</script>

<template>
  <div class="flex flex-col h-full w-full md:flex-row">
    <IndexSidebar />
    <div class="flex flex-col h-full w-full overflow-y-auto">
      <ProjectHeader v-if="project" :project />
      <!-- Content -->
      <div class="p-4 pt-0 flex flex-col">
        <ProjectNavbar />
        <slot />
      </div>
    </div>
  </div>
</template>
