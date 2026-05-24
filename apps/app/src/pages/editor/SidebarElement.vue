<script setup lang="ts">
import type { EditorElement, ElementPriorityReasonCode } from "@cat/shared";
import type { ElementTranslationStatus } from "@cat/shared";

import { SidebarMenuButton } from "@cat/ui";
import { storeToRefs } from "pinia";
import { navigate } from "vike/client/router";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import { useEditorContextStore } from "@/stores/editor/context.ts";
import { useEditorElementStore } from "@/stores/editor/element.ts";
import { useEditorTableStore } from "@/stores/editor/table";

import { buildEditorHref } from "./scope-url";

const { t } = useI18n();
const { scope } = storeToRefs(useEditorContextStore());
const tableStore = useEditorTableStore();
const { elementId } = storeToRefs(tableStore);
const { pendingElements } = useEditorElementStore();

const props = defineProps<{
  element: Pick<EditorElement, "id" | "priority"> & {
    status: ElementTranslationStatus;
    value: string;
  };
}>();

const priorityReasonLabels: Record<ElementPriorityReasonCode, string> = {
  REUSE_SEED: "复用种子",
  TEMPLATE_MATCH: "模板复用",
  NEIGHBOR_CONTEXT: "邻近上下文",
  CLUSTER_CONTINUITY: "同簇连续",
  FOUNDATION: "基础短语",
  STRUCTURE_FALLBACK: "结构回退",
  LOW_CONFIDENCE: "低置信度",
};

const priorityReasonLabel = computed(() => {
  const reason = props.element.priority?.reasonCodes[0];
  return reason ? priorityReasonLabels[reason] : null;
});

const handleClick = () => {
  if (!props.element || !scope.value) return;

  tableStore.selectLoadedElement(props.element.id);

  void navigate(buildEditorHref(scope.value, props.element.id), {
    keepScrollPosition: true,
  }).catch(() => undefined);
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
    <span class="min-w-0 flex-1 truncate">{{ element.value }}</span>
    <span
      v-if="priorityReasonLabel"
      class="rounded bg-muted px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground"
    >
      {{ t(priorityReasonLabel) }}
    </span></SidebarMenuButton
  >
</template>
