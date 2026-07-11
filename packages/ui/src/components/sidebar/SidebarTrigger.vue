<script setup lang="ts">
import { PanelLeft } from "@lucide/vue";
import type { HTMLAttributes } from "vue";
import { computed } from "vue";

import { Button } from "#/components/button/index.ts";
import { useSidebar } from "#/components/sidebar/utils.ts";
import { cn } from "#/utils/lib/utils.ts";

const props = defineProps<{
  class?: HTMLAttributes["class"];
  sidebarId: string;
}>();

const triggerClass = computed(() => cn("h-7 w-7", props.class));

const { toggleSidebar } = useSidebar(props.sidebarId);
</script>

<template>
  <Button
    data-sidebar="trigger"
    data-slot="sidebar-trigger"
    variant="ghost"
    size="icon"
    :class="triggerClass"
    @click="toggleSidebar"
  >
    <PanelLeft />
    <span class="sr-only">Toggle Sidebar</span>
  </Button>
</template>
