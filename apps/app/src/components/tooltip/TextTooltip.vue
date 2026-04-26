<script setup lang="ts">
import type { TooltipContentProps } from "reka-ui";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@cat/ui";

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
