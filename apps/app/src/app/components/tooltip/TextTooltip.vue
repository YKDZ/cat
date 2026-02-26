<script setup lang="ts">
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@cat/app-ui";
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
      <TooltipTrigger as-child>
        <slot />
      </TooltipTrigger>
      <TooltipContent v-bind="props">
        <p>{{ tooltip }}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>
