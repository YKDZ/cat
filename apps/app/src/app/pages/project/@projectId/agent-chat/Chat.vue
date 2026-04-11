<script setup lang="ts">
import type { Project } from "@cat/shared/schema/drizzle/project";

import AgentChatPanel from "@/app/components/agent/AgentChatPanel.vue";

const props = defineProps<{
  project: Pick<Project, "id">;
}>();
</script>

<template>
  <div class="w-full bg-background">
    <AgentChatPanel :projectId="project.id" class="w-full" />
  </div>
</template>
