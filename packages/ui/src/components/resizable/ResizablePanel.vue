<script setup lang="ts">
import type { SplitterPanelEmits, SplitterPanelProps } from "reka-ui";
import { SplitterPanel, useForwardExpose, useForwardPropsEmits } from "reka-ui";

import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";

const props = defineProps<SplitterPanelProps>();
const emits = defineEmits<SplitterPanelEmits>();

const forwarded = useForwardPropsEmits(props, emits);
const { forwardRef } = useForwardExpose();
</script>

<template>
  <SplitterPanel
    :ref="forwardRef"
    v-slot="slotProps"
    data-slot="resizable-panel"
    v-bind="exactOptionalProps(forwarded)"
  >
    <slot v-bind="exactOptionalProps(slotProps)" />
  </SplitterPanel>
</template>
