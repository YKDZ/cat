<script setup lang="ts">
import EditorElemenContextJson from "@/app/components/EditorElemenContextJson.vue";
import EditorElemenContextMarkdown from "@/app/components/EditorElemenContextMarkdown.vue";
import { useEditorTableStore } from "@/app/stores/editor/table";
import { computedAsyncClient } from "@/app/utils/vue";
import { orpc } from "@/server/orpc";
import type { TranslatableElementContextType } from "@cat/shared/schema/drizzle/enum";
import { storeToRefs } from "pinia";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarContent,
} from "@/app/components/ui/sidebar";
import { ScrollArea } from "@/app/components/ui/scroll-area";

const { elementId } = storeToRefs(useEditorTableStore());

const contexts = computedAsyncClient(async () => {
  if (!elementId.value) return [];
  return orpc.element.getContexts({ elementId: elementId.value });
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
  <SidebarContent>
    <ScrollArea class="w-full h-full">
      <SidebarGroup>
        <SidebarGroupContent class="flex flex-col gap-3">
          <component
            v-for="context in contexts"
            :key="context.id"
            :is="componentFromType(context.type)"
            :context
          />
        </SidebarGroupContent>
      </SidebarGroup>
    </ScrollArea>
  </SidebarContent>
</template>
