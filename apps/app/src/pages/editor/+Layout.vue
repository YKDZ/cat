<script setup lang="ts">
import { ScrollArea } from "@cat/ui";
import { storeToRefs } from "pinia";
import { usePageContext } from "vike-vue/usePageContext";
import { watch } from "vue";
import * as z from "zod";

import { useEditorContextStore } from "@/stores/editor/context.ts";
import { useEditorElementStore } from "@/stores/editor/element";
import { useEditorTableStore } from "@/stores/editor/table.ts";
import { syncRefWith, watchClient } from "@/utils/vue.ts";

import ContextPanel from "./ContextPanel.vue";
import Header from "./Header.vue";
import Sidebar from "./Sidebar.vue";

const ctx = usePageContext();

const { refresh: refreshContext } = useEditorContextStore();
const { refresh: refreshElement } = useEditorElementStore();
const { toElement } = useEditorTableStore();
const { elementId, translationValue } = storeToRefs(useEditorTableStore());
const { documentId, languageToId } = storeToRefs(useEditorContextStore());

syncRefWith(documentId, () => z.uuidv4().parse(ctx.routeParams["documentId"]));
syncRefWith(languageToId, () => ctx.routeParams["languageToId"] ?? "");
syncRefWith(elementId, () => parseInt(ctx.routeParams["elementId"] ?? ""));

watchClient(
  elementId,
  (to, from) => {
    // Clear the translation editor synchronously when switching elements so
    // that toElement()'s async network work cannot race with typed input.
    if (from && to !== from) translationValue.value = "";
    if (to) toElement(to);
  },
  { immediate: true },
);

watch(
  documentId,
  (newDoc, oldDoc) => {
    if (newDoc === oldDoc) return;
    refreshContext();
    refreshElement();
  },
  { immediate: false },
);
</script>

<template>
  <div
    class="flex h-full max-h-full w-full flex-col overflow-hidden md:flex-row"
  >
    <div class="h-full shrink-0">
      <Sidebar />
    </div>

    <div class="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      <div class="sticky top-0 z-10 border-b bg-background">
        <Header />
      </div>

      <div class="min-h-0 w-full flex-1">
        <ScrollArea class="h-full w-full">
          <slot />
        </ScrollArea>
      </div>
    </div>

    <div
      class="flex h-full w-full shrink-0 flex-col overflow-hidden border-t md:w-auto md:border-t-0 md:border-l"
    >
      <ContextPanel />
    </div>
  </div>
</template>
