<script setup lang="ts">
import type { HTMLAttributes } from "vue";

import { PanelLeft } from "lucide-vue-next";
import { computed } from "vue";

import { Button } from "@/components/button";
import { cn } from "@/utils/lib/utils";

import { useSidebar } from "./utils";

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
