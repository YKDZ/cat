<script setup lang="ts">
import type { TooltipProviderProps } from "reka-ui";
import { TooltipProvider } from "reka-ui";

import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";

const props = withDefaults(defineProps<TooltipProviderProps>(), {
  delayDuration: 0,
});
</script>

<template>
  <TooltipProvider v-bind="exactOptionalProps(props)">
    <slot />
  </TooltipProvider>
</template>
