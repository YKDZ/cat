<script setup lang="ts">
import type { PopoverTriggerProps } from "reka-ui";
import { PopoverTrigger } from "reka-ui";

import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";

const props = defineProps<PopoverTriggerProps>();
</script>

<template>
  <PopoverTrigger
    data-slot="popover-trigger"
    v-bind="exactOptionalProps(props)"
  >
    <slot />
  </PopoverTrigger>
</template>
