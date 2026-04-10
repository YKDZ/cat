<script setup lang="ts">
import { inject } from "vue";

import { useInjectionKey } from "@/app/utils/provide.ts";

import type { Data as LayoutData } from "../+data.server.ts";

import AgentKanbanPanel from "../AgentKanbanPanel.vue";

const project = inject(useInjectionKey<LayoutData>()("project"))!;
</script>

<template>
  <AgentKanbanPanel :project />
</template>
