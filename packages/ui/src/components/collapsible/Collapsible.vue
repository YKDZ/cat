<script setup lang="ts">
import type { CollapsibleRootEmits, CollapsibleRootProps } from "reka-ui";
import { CollapsibleRoot, useForwardPropsEmits } from "reka-ui";

import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";

const props = defineProps<CollapsibleRootProps>();
const emits = defineEmits<CollapsibleRootEmits>();

const forwarded = useForwardPropsEmits(props, emits);
</script>

<template>
  <CollapsibleRoot
    v-slot="slotProps"
    data-slot="collapsible"
    v-bind="exactOptionalProps(forwarded)"
  >
    <slot v-bind="exactOptionalProps(slotProps)" />
  </CollapsibleRoot>
</template>
