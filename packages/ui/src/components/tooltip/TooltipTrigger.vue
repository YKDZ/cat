<script setup lang="ts">
import type { TooltipTriggerProps } from "reka-ui";
import { TooltipTrigger } from "reka-ui";

import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";

const props = defineProps<TooltipTriggerProps>();
</script>

<template>
  <TooltipTrigger
    data-slot="tooltip-trigger"
    v-bind="exactOptionalProps(props)"
  >
    <slot />
  </TooltipTrigger>
</template>
