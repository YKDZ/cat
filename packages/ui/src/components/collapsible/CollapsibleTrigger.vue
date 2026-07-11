<script setup lang="ts">
import type { CollapsibleTriggerProps } from "reka-ui";
import { CollapsibleTrigger } from "reka-ui";

import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";

const props = defineProps<CollapsibleTriggerProps>();
</script>

<template>
  <CollapsibleTrigger
    data-slot="collapsible-trigger"
    v-bind="exactOptionalProps(props)"
  >
    <slot />
  </CollapsibleTrigger>
</template>
