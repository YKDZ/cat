<script setup lang="ts">
import { navigate } from "vike/client/router";
import { storeToRefs } from "pinia";
import { onMounted } from "vue";
import type { TranslatableElement } from "@cat/shared/schema/prisma/document";
import { useEditorContextStore } from "@/app/stores/editor/context.ts";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";
import { useEditorElementStore } from "@/app/stores/editor/element.ts";

const { elementId } = storeToRefs(useEditorTableStore());
const { documentId, languageFromId, languageToId } = storeToRefs(
  useEditorContextStore(),
);
const { updateElementStatus } = useEditorElementStore();

const props = defineProps<{
  element: TranslatableElement & { status?: "NO" | "TRANSLATED" | "APPROVED" };
}>();

const handleClick = async () => {
  if (!props.element) return;

  await navigate(
    `/editor/${documentId.value}/${languageFromId.value}-${languageToId.value}/${props.element.id}`,
  );
};

onMounted(() => updateElementStatus(props.element.id));
</script>

<template>
  <button
    v-if="element"
    class="px-2 py-2 text-start flex gap-3 cursor-pointer items-center hover:bg-highlight-darkest"
    :class="{
      'bg-highlight-darkest': element.id === elementId,
    }"
    @click="handleClick"
  >
    <span
      class="h-2 min-h-2 min-w-2 w-2 block"
      :class="{
        'bg-error-darkest': element.status === 'NO',
        'bg-info-darkest': element.status === 'TRANSLATED',
        'bg-success-darkest': element.status === 'APPROVED',
      }"
    />
    <span class="text-nowrap overflow-x-hidden">{{ element.value }}</span>
  </button>
</template>
