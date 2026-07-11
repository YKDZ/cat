<script setup lang="ts">
import type { AccordionRootEmits, AccordionRootProps } from "reka-ui";
import { AccordionRoot, useForwardPropsEmits } from "reka-ui";

import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";

const props = defineProps<AccordionRootProps>();
const emits = defineEmits<AccordionRootEmits>();

const forwarded = useForwardPropsEmits(props, emits);
</script>

<template>
  <AccordionRoot
    v-slot="slotProps"
    data-slot="accordion"
    v-bind="exactOptionalProps(forwarded)"
  >
    <slot v-bind="exactOptionalProps(slotProps)" />
  </AccordionRoot>
</template>
