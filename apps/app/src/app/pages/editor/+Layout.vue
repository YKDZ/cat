<script setup lang="ts">
import { storeToRefs } from "pinia";
import { usePageContext } from "vike-vue/usePageContext";
import * as z from "zod";
import EditorHeader from "@/app/components/EditorHeader.vue";
import EditorSidebar from "@/app/components/EditorSidebar.vue";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";
import { useEditorContextStore } from "@/app/stores/editor/context.ts";
import { syncRefWith, watchClient } from "@/app/utils/vue.ts";
import { useEditorElementStore } from "@/app/stores/editor/element";
import { watch } from "vue";

const ctx = usePageContext();

const { refresh: refreshContext } = useEditorContextStore();
const { refresh: refreshElement } = useEditorElementStore();
const { toElement } = useEditorTableStore();
const { elementId } = storeToRefs(useEditorTableStore());
const { documentId, languageToId } = storeToRefs(useEditorContextStore());

syncRefWith(documentId, () => z.uuidv7().parse(ctx.routeParams["documentId"]));
syncRefWith(languageToId, () => ctx.routeParams["languageToId"] ?? "");
syncRefWith(elementId, () => parseInt(ctx.routeParams["elementId"] ?? ""));

watchClient(
  elementId,
  (to) => {
    if (to) toElement(to);
  },
  { immediate: true },
);

watch(
  documentId,
  () => {
    refreshContext();
    refreshElement();
  },
  { immediate: true },
);
</script>

<template>
  <div class="flex flex-col h-full max-h-full w-full md:flex-row">
    <EditorSidebar />
    <div class="flex flex-col h-full w-full overflow-y-auto">
      <EditorHeader />
      <div class="m-4 mb-0 flex flex-col gap-2 h-full max-h-full">
        <slot />
      </div>
    </div>
  </div>
</template>
