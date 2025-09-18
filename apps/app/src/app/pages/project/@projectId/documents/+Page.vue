<script setup lang="ts">
import { inject, ref } from "vue";
import { useData } from "vike-vue/useData";
import type { Document } from "@cat/shared/schema/prisma/document";
import type { Data } from "./+data.ts";
import ProjectDocumentList from "@/app/components/ProjectDocumentList.vue";
import ProjectUploadFileBtn from "@/app/components/ProjectUploadFileBtn.vue";
import { projectKey } from "@/app/utils/provide.ts";

const project = inject(projectKey);

const documents = ref<Document[]>(useData<Data>().documents);

const handleDeleteDocument = (id: string) => {
  if (!project || !project.Documents) return;

  documents.value = documents.value.filter((doc) => doc.id !== id);
};
</script>

<template>
  <div class="pt-3 flex flex-col gap-3 w-full">
    <ProjectUploadFileBtn />
    <ProjectDocumentList
      :documents="documents"
      @delete="handleDeleteDocument"
    />
  </div>
</template>
