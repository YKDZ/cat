<script setup lang="ts">
import { Badge, SidebarMenuButton, SidebarMenuItem } from "@cat/ui";
import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";

import { useQaReviewWorkbenchStore } from "@/stores/qa-review/workbench";

const { t } = useI18n();
const store = useQaReviewWorkbenchStore();
const { elements, selectedElementId } = storeToRefs(store);
</script>

<template>
  <SidebarMenuItem v-for="element in elements" :key="element.elementId">
    <SidebarMenuButton
      sidebarId="editor"
      :is-active="selectedElementId === element.elementId"
      class="h-auto min-h-16 items-start gap-2 px-3 py-2"
      @click="store.selectElement(element.elementId)"
    >
      <div class="flex min-w-0 flex-1 flex-col gap-1 text-left">
        <div class="flex items-center gap-1">
          <Badge v-if="element.hardFindingCount > 0" variant="destructive">
            {{ element.hardFindingCount }}
          </Badge>
          <Badge variant="secondary">
            {{ t("{count} 候选", { count: element.candidateCount }) }}
          </Badge>
          <Badge v-if="element.approvedTranslationId" variant="secondary">
            {{ t("已批准") }}
          </Badge>
        </div>
        <span class="line-clamp-2 text-sm">{{ element.sourceText }}</span>
        <span class="truncate text-xs text-muted-foreground">
          {{ element.primaryContentNodeLabel ?? "" }}
        </span>
      </div>
    </SidebarMenuButton>
  </SidebarMenuItem>
</template>
