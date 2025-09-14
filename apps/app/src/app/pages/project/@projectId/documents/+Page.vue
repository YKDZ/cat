<script setup lang="ts">
import { useData } from "vike-vue/useData";
import type { Data } from "./+data.ts";
import ProjectDocumentList from "@/app/components/ProjectDocumentList.vue";
import ProjectUploadFileBtn from "@/app/components/ProjectUploadFileBtn.vue";

const { project } = useData<Data>();

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
