<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { computed } from "vue";
import { PanelLeft } from "lucide-vue-next";
import { cn } from "@/app/utils/lib/utils";
import { Button } from "@/app/components/ui/button";
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
