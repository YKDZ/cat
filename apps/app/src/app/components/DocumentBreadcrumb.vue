<script setup lang="ts">
import { Document } from "@cat/shared";
import ProjectBreadcrumb from "./ProjectBreadcrumb.vue";
import { computed, onMounted, watch } from "vue";
import { useProjectStore } from "../stores/project";
import Slash from "./Slash.vue";

const { fetchProject } = useProjectStore();

const props = defineProps<{
  document: Document;
}>();

const project = computed(() => {
  return (
    useProjectStore().projects.find(
      (project) => project.id === props.document.projectId,
    ) ?? null
  );
});
</script>

<template>
  <div class="flex items-center">
    <div class="text-lg font-bold flex gap-2 items-center">
      <span :class="document?.Type.icon" class="h-6 w-6 inline-block" />{{
        document?.File?.originName
      }}
    </div>
  </div>
</template>
