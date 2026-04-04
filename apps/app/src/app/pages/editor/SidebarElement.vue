<script setup lang="ts">
import type { TranslatableElement } from "@cat/shared/schema/drizzle/document";
import type { ElementTranslationStatus } from "@cat/shared/schema/misc";

import { SidebarMenuButton } from "@cat/ui";
import { storeToRefs } from "pinia";
import { navigate } from "vike/client/router";

import { useEditorContextStore } from "@/app/stores/editor/context.ts";
import { useEditorElementStore } from "@/app/stores/editor/element.ts";
import { useEditorTableStore } from "@/app/stores/editor/table";

const { documentId, languageToId } = storeToRefs(useEditorContextStore());
const { elementId } = storeToRefs(useEditorTableStore());
const { pendingElements } = useEditorElementStore();

const props = defineProps<{
  element: Pick<TranslatableElement, "id"> & {
    status: ElementTranslationStatus;
    value: string;
  };
}>();

const handleClick = async () => {
  if (!props.element) return;

  await navigate(
    `/editor/${documentId.value}/${languageToId.value}/${props.element.id}`,
    // 保持滚动位置，避免不必要的跳转
    { keepScrollPosition: true },
  );
};
/* onMounted(() => updateElementStatus(props.element.id)); */
</script>

<template>
  <SidebarMenuButton
    sidebarId="editor"
    @click="handleClick"
    :class="{ 'bg-muted font-bold': element.id === elementId }"
  >
    <span
      class="h-2 w-2 shrink-0"
      :class="{
        'bg-yellow-300': pendingElements.has(element.id),
        'bg-red-300':
          !pendingElements.has(element.id) && element.status === 'NO',
        'bg-green-300':
          !pendingElements.has(element.id) && element.status === 'TRANSLATED',
        'bg-blue-500':
          !pendingElements.has(element.id) && element.status === 'APPROVED',
      }"
    />
    <span class="min-w-0 truncate">{{ element.value }}</span></SidebarMenuButton
  >
</template>
