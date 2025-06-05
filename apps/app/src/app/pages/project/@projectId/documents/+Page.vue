<script setup lang="ts">
import ProjectDocumentList from "@/app/components/ProjectDocumentList.vue";
import ProjectUploadFileBtn from "@/app/components/ProjectUploadFileBtn.vue";
import { projectKey } from "@/app/utils/provide";
import { inject } from "vue";

const project = inject(projectKey);

const handleDeleteDocument = (id: string) => {
  if (!project || !project.value || !project.value.Documents) return;

  const index = project.value.Documents.findIndex(
    (document) => document.id === id,
  );
  project.value.Documents.splice(index, 1);
};
</script>

<template>
  <div class="pt-3 flex flex-col gap-3 w-full">
    <ProjectUploadFileBtn />
    <ProjectDocumentList
      :documents="project?.Documents ?? []"
      @delete="handleDeleteDocument"
    />
  </div>
</template>
