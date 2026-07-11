<script setup lang="ts">
import type { PopoverRootEmits, PopoverRootProps } from "reka-ui";
import { PopoverRoot, useForwardPropsEmits } from "reka-ui";

import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";

const props = defineProps<PopoverRootProps>();
const emits = defineEmits<PopoverRootEmits>();

const forwarded = useForwardPropsEmits(props, emits);
</script>

<template>
  <PopoverRoot
    v-slot="slotProps"
    data-slot="popover"
    v-bind="exactOptionalProps(forwarded)"
  >
    <slot v-bind="exactOptionalProps(slotProps)" />
  </PopoverRoot>
</template>
