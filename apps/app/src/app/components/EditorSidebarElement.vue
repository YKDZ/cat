<script setup lang="ts">
import { navigate } from "vike/client/router";
import { storeToRefs } from "pinia";
import { onMounted } from "vue";
import type { TranslatableElement } from "@cat/shared/schema/drizzle/document";
import { useEditorContextStore } from "@/app/stores/editor/context.ts";
import { useEditorElementStore } from "@/app/stores/editor/element.ts";
import { SidebarMenuButton } from "@/app/components/ui/sidebar";

const { documentId, languageToId } = storeToRefs(useEditorContextStore());
const { updateElementStatus } = useEditorElementStore();

const props = defineProps<{
  element: Pick<TranslatableElement, "id"> & {
    status: "NO" | "TRANSLATED" | "APPROVED";
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
  <SidebarMenuButton @click="handleClick">
    <span
      class="shrink-0 w-2 h-2"
      :class="{
        ' bg-error-darkest': element.status === 'NO',
        ' bg-info-darkest': element.status === 'TRANSLATED',
        ' bg-success-darkest': element.status === 'APPROVED',
      }"
    />
    <span class="min-w-0 truncate">{{ element.value }}</span></SidebarMenuButton
  >
</template>
