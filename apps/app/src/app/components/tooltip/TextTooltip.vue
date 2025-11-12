<script setup lang="ts">
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/app/components/ui/tooltip";
import type { TooltipContentProps } from "reka-ui";

const props = withDefaults(
  defineProps<TooltipContentProps & { tooltip: string }>(),
  {
    sideOffset: 4,
  },
);
</script>

<template>
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger :class="$attrs.class">
        <slot />
      </TooltipTrigger>
      <TooltipContent v-bind="props">
        <p>{{ tooltip }}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>
