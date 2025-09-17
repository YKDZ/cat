<script setup lang="ts">
import { inject } from "vue";
import ProjectDocumentList from "@/app/components/ProjectDocumentList.vue";
import ProjectUploadFileBtn from "@/app/components/ProjectUploadFileBtn.vue";
import { projectKey } from "@/app/utils/provide.ts";

const project = inject(projectKey);

const handleDeleteDocument = () => {
  if (!project || !project.Documents) return;
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
