<script setup lang="ts">
import type { TranslatableElementContextType } from "@cat/shared/schema/drizzle/enum";

import { SidebarGroup, SidebarGroupContent, SidebarContent } from "@cat/ui";
import { ScrollArea } from "@cat/ui";
import { useQuery } from "@pinia/colada";
import { storeToRefs } from "pinia";

import { orpc } from "@/app/rpc/orpc";
import { useEditorTableStore } from "@/app/stores/editor/table";

import ElemenContextJson from "./ElemenContextJson.vue";
import ElemenContextMarkdown from "./ElemenContextMarkdown.vue";

const { elementId } = storeToRefs(useEditorTableStore());


const { state } = useQuery({
  key: ["context", elementId.value],
  placeholderData: [],
  query: () => {
    if (elementId.value) {
      return orpc.element.getContexts({ elementId: elementId.value });
    }
    return Promise.resolve([]);
  },
  enabled: !import.meta.env.SSR,
});


const componentFromType = (type: TranslatableElementContextType) => {
  switch (type) {
    case "JSON":
      return ElemenContextJson;
    case "MARKDOWN":
      return ElemenContextMarkdown;
    default:
      return null;
  }
};
</script>

<template>
  <SidebarContent>
    <ScrollArea class="h-full w-full">
      <SidebarGroup>
        <SidebarGroupContent class="flex flex-col gap-3">
          <component
            v-for="context in state.data"
            :key="context.id"
            :is="componentFromType(context.type)"
            :context
          />
        </SidebarGroupContent>
      </SidebarGroup>
    </ScrollArea>
  </SidebarContent>
</template>
