<script setup lang="ts">
import ElemenContextJson from "./ElemenContextJson.vue";
import ElemenContextMarkdown from "./ElemenContextMarkdown.vue";
import { useEditorTableStore } from "@/app/stores/editor/table";
import { orpc } from "@/server/orpc";
import type { TranslatableElementContextType } from "@cat/shared/schema/drizzle/enum";
import { storeToRefs } from "pinia";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarContent,
} from "@/app/components/ui/sidebar";
import { ScrollArea } from "@/app/components/ui/scroll-area";
import { useQuery } from "@pinia/colada";

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
    <ScrollArea class="w-full h-full">
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
