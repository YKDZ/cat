<script setup lang="ts">
import type { ContentNode } from "@cat/shared";

import { ref } from "vue";

import Markdown from "@/components/Markdown.vue";
import { orpc } from "@/rpc/orpc";
import { clientLogger as logger } from "@/utils/logger";
import { watchClient } from "@/utils/vue.ts";

const props = defineProps<{
  readme: Pick<ContentNode, "id">;
}>();

const markdownContent = ref<string>("");
let lastRequestedContentNodeId: string | null = null;

const updateContent = async () => {
  if (!props.readme) {
    return;
  }

  markdownContent.value = "";

  const contentNodeId = props.readme.id;
  lastRequestedContentNodeId = contentNodeId;

  try {
    const fileUrl = await orpc.file.getUrl({
      contentNodeId,
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

    if (lastRequestedContentNodeId !== contentNodeId) {
      return;
    }

    markdownContent.value = text;
  } catch (error) {
    logger.withSituation("WEB").error(error, "Failed to load README markdown");
  }
};

watchClient(() => props.readme, updateContent, { immediate: true });
</script>

<template>
  <Markdown class="markdown markdown-background" :content="markdownContent" />
</template>
