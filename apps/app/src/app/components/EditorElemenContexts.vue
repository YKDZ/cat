<script setup lang="ts">
import EditorElemenContextJson from "@/app/components/EditorElemenContextJson.vue";
import EditorElemenContextMarkdown from "@/app/components/EditorElemenContextMarkdown.vue";
import { useEditorTableStore } from "@/app/stores/editor/table";
import { computedAsyncClient } from "@/app/utils/vue";
import { trpc } from "@cat/app-api/trpc/client";
import type { TranslatableElementContextType } from "@cat/shared/schema/drizzle/enum";
import { storeToRefs } from "pinia";

const { elementId } = storeToRefs(useEditorTableStore());

const contexts = computedAsyncClient(async () => {
  if (!elementId.value) return [];
  return trpc.element.getContexts.query({ elementId: elementId.value });
}, []);

const componentFromType = (type: TranslatableElementContextType) => {
  switch (type) {
    case "JSON":
      return EditorElemenContextJson;
    case "MARKDOWN":
      return EditorElemenContextMarkdown;
    default:
      return null;
  }
};
</script>

<template>
  <div class="flex flex-col gap-1">
    <component
      v-for="context in contexts"
      :key="context.id"
      :is="componentFromType(context.type)"
      :context
    />
  </div>
</template>
