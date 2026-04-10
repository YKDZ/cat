<script setup lang="ts">
import type { Project } from "@cat/shared/schema/drizzle/project";

import { Tabs, TabsList, TabsTrigger } from "@cat/ui";
import { Bot, ChevronDown, ChevronUp, LayoutGrid } from "@lucide/vue";
import { ref } from "vue";
import { useI18n } from "vue-i18n";

import AgentChatPanel from "@/app/components/agent/AgentChatPanel.vue";
import KanbanSummary from "@/app/components/kanban/KanbanSummary.vue";

const props = defineProps<{
  project: Pick<Project, "id">;
}>();

const { t } = useI18n();
const isExpanded = ref(false);
const activeTab = ref<"agent" | "kanban">("agent");

const toggle = () => {
  isExpanded.value = !isExpanded.value;
};
</script>

<template>
  <div class="w-full border-b bg-background">
    <!-- Collapsed state: status summary bar -->
    <div
      class="flex cursor-pointer items-center justify-between px-4 py-2 hover:bg-muted/50"
      @click="toggle"
    >
      <div class="flex items-center gap-2 text-sm text-muted-foreground">
        <Bot class="size-4" />
        <span>{{ t("Agent 控制面板") }}</span>
      </div>
      <component
        :is="isExpanded ? ChevronUp : ChevronDown"
        class="size-4 text-muted-foreground"
      />
    </div>

    <!-- Expanded state: full-width panel -->
    <div v-if="isExpanded" class="border-t">
      <Tabs v-model="activeTab">
        <TabsList class="mx-4 mt-2">
          <TabsTrigger value="agent">
            <Bot class="mr-1.5 size-4" />
            {{ t("Agent 对话") }}
          </TabsTrigger>
          <TabsTrigger value="kanban">
            <LayoutGrid class="mr-1.5 size-4" />
            {{ t("看板") }}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div class="flex h-[60vh] min-h-[320px] overflow-hidden px-4 py-3">
        <AgentChatPanel
          v-if="activeTab === 'agent'"
          :projectId="project.id"
          class="w-full"
        />
        <KanbanSummary
          v-else-if="activeTab === 'kanban'"
          :projectId="project.id"
          class="w-full"
        />
      </div>
    </div>
  </div>
</template>
