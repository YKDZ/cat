<script setup lang="ts">
import { navigate } from "vike/client/router";
import { storeToRefs } from "pinia";
import { onMounted } from "vue";
import type { TranslatableElement } from "@cat/shared/schema/drizzle/document";
import { useEditorContextStore } from "@/app/stores/editor/context.ts";
import { useEditorElementStore } from "@/app/stores/editor/element.ts";
import { SidebarMenuButton } from "@/app/components/ui/sidebar";
import type { ElementTranslationStatus } from "@cat/shared/schema/misc";
import { useEditorTableStore } from "@/app/stores/editor/table";

const { documentId, languageToId } = storeToRefs(useEditorContextStore());
const { elementId } = storeToRefs(useEditorTableStore());
const { updateElementStatus, pendingElements } = useEditorElementStore();

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
  );
};

onMounted(() => updateElementStatus(props.element.id));
</script>

<template>
  <SidebarMenuButton
    sidebarId="editor"
    @click="handleClick"
    :class="{ 'font-bold bg-muted': element.id === elementId }"
  >
    <span
      class="shrink-0 w-2 h-2"
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
