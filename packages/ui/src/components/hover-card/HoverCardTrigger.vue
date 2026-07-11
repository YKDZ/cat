<script setup lang="ts">
import type { HoverCardTriggerProps } from "reka-ui";
import { HoverCardTrigger } from "reka-ui";

import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";

const props = defineProps<HoverCardTriggerProps>();
</script>

<template>
  <HoverCardTrigger
    data-slot="hover-card-trigger"
    v-bind="exactOptionalProps(props)"
  >
    <slot />
  </HoverCardTrigger>
</template>
