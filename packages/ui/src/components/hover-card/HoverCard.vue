<script setup lang="ts">
import type { HoverCardRootEmits, HoverCardRootProps } from "reka-ui";
import { HoverCardRoot, useForwardPropsEmits } from "reka-ui";

import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";

const props = defineProps<HoverCardRootProps>();
const emits = defineEmits<HoverCardRootEmits>();

const forwarded = useForwardPropsEmits(props, emits);
</script>

<template>
  <HoverCardRoot
    v-slot="slotProps"
    data-slot="hover-card"
    v-bind="exactOptionalProps(forwarded)"
  >
    <slot v-bind="exactOptionalProps(slotProps)" />
  </HoverCardRoot>
</template>
