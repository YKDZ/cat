<script setup lang="ts">
import type { Project } from "@cat/shared";

import { Button } from "@cat/ui";
import { PanelLeftClose, PanelLeftOpen } from "@lucide/vue";
import { ref } from "vue";

import AgentChatPanel from "@/app/components/agent/AgentChatPanel.vue";
import AgentSessionSidebar from "@/app/components/agent/AgentSessionSidebar.vue";
import { useAgentStore } from "@/app/stores/agent";

const props = defineProps<{
  project: Pick<Project, "id" | "name">;
}>();

const agentStore = useAgentStore();
const sidebarOpen = ref(true);

const handleNewSession = () => {
  agentStore.selectDefinition(null);
};
</script>

<template>
  <div class="flex h-full w-full overflow-hidden bg-background">
    <!-- Sidebar toggle button (visible when sidebar is collapsed) -->
    <div v-if="!sidebarOpen" class="flex shrink-0 flex-col border-r">
      <Button
        size="icon-sm"
        variant="ghost"
        class="m-1"
        @click="sidebarOpen = true"
      >
        <PanelLeftOpen class="size-4" />
      </Button>
    </div>

    <!-- Session Sidebar -->
    <div v-if="sidebarOpen" class="flex w-56 shrink-0 flex-col">
      <div class="flex shrink-0 justify-end border-b px-1 py-1">
        <Button size="icon-sm" variant="ghost" @click="sidebarOpen = false">
          <PanelLeftClose class="size-4" />
        </Button>
      </div>
      <div class="min-h-0 flex-1 overflow-hidden">
        <AgentSessionSidebar
          :projectId="project.id"
          @new-session="handleNewSession"
        />
      </div>
    </div>

    <!-- Chat Panel -->
    <div class="min-w-0 flex-1 overflow-hidden">
      <AgentChatPanel
        :projectId="project.id"
        :projectName="project.name"
        class="h-full w-full"
      />
    </div>
  </div>
</template>
