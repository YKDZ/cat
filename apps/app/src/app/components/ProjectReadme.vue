<script setup lang="ts">
import { trpc } from "@cat/app-api/trpc/client";
import type { Document } from "@cat/shared/schema/prisma/document";
import type { File } from "@cat/shared/schema/prisma/file";
import type { Project } from "@cat/shared/schema/prisma/project";
import { computed, ref } from "vue";
import { watchClient } from "@/app/utils/vue.ts";
import HMarkdown from "@/app/components/headless/HMarkdown.vue";

const props = defineProps<{
  project: Project & {
    Documents: (Document & {
      File: File | null;
    })[];
  };
}>();

const readme = computed(() => {
  return props.project.Documents.filter((doc) => doc.File || doc.name).find(
    (doc) => doc.File!.originName === "README.md" || doc.name === "README.md",
  );
});

const content = ref("");

const updateContent = async () => {
  if (!readme.value) {
    return;
  }

  content.value = await trpc.document.getDocumentContent.query({
    documentId: readme.value.id,
  });
};

watchClient(readme, updateContent, { immediate: true });
</script>

<template>
  <HMarkdown
    :classes="{
      container: 'markdown markdown-highlight',
    }"
    :content
  />
</template>
