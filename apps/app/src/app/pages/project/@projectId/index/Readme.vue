<script setup lang="ts">
import type { Document } from "@cat/shared/schema/drizzle/document";

import { logger } from "@cat/shared/utils";
import { ref } from "vue";

import Markdown from "@/app/components/Markdown.vue";
import { watchClient } from "@/app/utils/vue.ts";
import { orpc } from "@/server/orpc";

const props = defineProps<{
  readme: Pick<Document, "id">;
}>();


const markdownContent = ref<string>("");
let lastRequestedDocumentId: string | null = null;


const updateContent = async () => {
  if (!props.readme) {
    return;
  }


  markdownContent.value = "";


  const documentId = props.readme.id;
  lastRequestedDocumentId = documentId;


  try {
    const fileUrl = await orpc.document.getDocumentFileUrl({
      documentId,
    });


    if (!fileUrl) {
      markdownContent.value = "";
      return;
    }


    const response = await fetch(fileUrl);


    if (!response.ok) {
      throw new Error(`Failed to fetch README content: ${response.status}`);
    }


    const text = await response.text();


    if (lastRequestedDocumentId !== documentId) {
      return;
    }


    markdownContent.value = text;
  } catch (error) {
    logger.error("WEB", { msg: "Failed to load README markdown" }, error);
  }
};


watchClient(() => props.readme, updateContent, { immediate: true });
</script>

<template>
  <Markdown class="markdown markdown-background" :content="markdownContent" />
</template>
