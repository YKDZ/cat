<script setup lang="ts">
import { trpc } from "@cat/app-api/trpc/client";
import type { Document } from "@cat/shared/schema/drizzle/document";
import { computed, ref } from "vue";
import { watchClient } from "@/app/utils/vue.ts";
import HMarkdown from "@/app/components/headless/HMarkdown.vue";
import { logger } from "@cat/shared/utils";

const props = defineProps<{
  readme: Document;
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
    const fileUrl = await trpc.document.getDocumentFileUrl.query({
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
  <HMarkdown
    :classes="{
      container: 'markdown markdown-highlight',
    }"
    :content="markdownContent"
  />
</template>
