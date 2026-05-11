<script setup lang="ts">
import type { FlattenedContextEvidence } from "@cat/shared";

import { SidebarGroup, SidebarGroupContent, SidebarContent } from "@cat/ui";
import { ScrollArea } from "@cat/ui";
import { useQuery } from "@pinia/colada";
import { storeToRefs } from "pinia";

import { orpc } from "@/rpc/orpc";
import { useEditorTableStore } from "@/stores/editor/table";

import ElemenContextJson from "./ElemenContextJson.vue";
import ElemenContextMarkdown from "./ElemenContextMarkdown.vue";

const { elementId } = storeToRefs(useEditorTableStore());

const { state } = useQuery({
  key: () => ["context", elementId.value],
  placeholderData: [],
  query: () => {
    if (elementId.value) {
      return orpc.element.getContexts({ elementId: elementId.value });
    }
    return Promise.resolve([]);
  },
  enabled: () => !import.meta.env.SSR && !!elementId.value,
});

const componentFromContext = (context: FlattenedContextEvidence) => {
  const payload = context.payload;
  if (!payload || typeof payload !== "object") return null;
  if ("kind" in payload) {
    const kind = payload.kind as string;
    if (kind === "JSON" || kind === "GENERATED_ANALYSIS")
      return ElemenContextJson;
    if (kind === "TEXT" || kind === "MARKDOWN") return ElemenContextMarkdown;
  }
  // Source text evidence (has text + languageId)
  if ("text" in payload && "languageId" in payload)
    return ElemenContextMarkdown;
  if ("json" in payload) return ElemenContextJson;
  return null;
};
</script>

<template>
  <SidebarContent>
    <ScrollArea class="h-full w-full">
      <SidebarGroup>
        <SidebarGroupContent class="flex flex-col gap-3">
          <component
            v-for="(context, idx) in state.data"
            :key="idx"
            :is="componentFromContext(context)"
            :context
          />
        </SidebarGroupContent>
      </SidebarGroup>
    </ScrollArea>
  </SidebarContent>
</template>
