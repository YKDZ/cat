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
import EditorContextPanel from "@/app/components/EditorContextPanel.vue";
import { ScrollArea } from "@/app/components/ui/scroll-area";

const ctx = usePageContext();

const { refresh: refreshContext } = useEditorContextStore();
const { refresh: refreshElement } = useEditorElementStore();
const { toElement } = useEditorTableStore();
const { elementId } = storeToRefs(useEditorTableStore());
const { documentId, languageToId } = storeToRefs(useEditorContextStore());

syncRefWith(documentId, () => z.uuidv4().parse(ctx.routeParams["documentId"]));
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
  <div
    class="flex flex-col h-full max-h-full w-full md:flex-row overflow-hidden"
  >
    <div class="shrink-0 h-full">
      <EditorSidebar />
    </div>

    <div class="flex flex-col flex-1 h-full min-w-0">
      <div class="sticky top-0 z-10 border-b bg-background">
        <EditorHeader />
      </div>

      <ScrollArea class="flex-1 w-full h-full">
        <div class="flex flex-col h-full">
          <slot />
        </div>
      </ScrollArea>
    </div>

    <div
      class="w-full h-full border-t md:border-t-0 md:border-l flex flex-col overflow-hidden shrink-0 md:w-auto"
    >
      <EditorContextPanel />
    </div>
  </div>
</template>
