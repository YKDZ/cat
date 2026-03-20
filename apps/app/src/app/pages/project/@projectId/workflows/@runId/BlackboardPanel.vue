<script setup lang="ts">
import { Badge } from "@cat/ui";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import JsonViewer from "@/app/components/JsonViewer.vue";
import { useWorkflowStore } from "@/app/stores/workflow";

const { t } = useI18n();
const workflowStore = useWorkflowStore();


const version = computed(() => workflowStore.blackboardVersion);
const blackboard = computed(() => workflowStore.blackboard);
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex shrink-0 items-center gap-2 border-b px-4 py-2">
      <span class="text-sm font-medium">{{ t("黑板状态") }}</span>
      <Badge variant="outline" class="h-4 px-1 text-[10px]"
        >v{{ version }}</Badge
      >
    </div>
    <div class="min-h-0 flex-1 p-4">
      <JsonViewer :value="blackboard" class="h-full" />
    </div>
  </div>
</template>
