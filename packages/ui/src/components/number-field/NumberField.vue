<script setup lang="ts">
import { reactiveOmit } from "@vueuse/core";
import type { NumberFieldRootEmits, NumberFieldRootProps } from "reka-ui";
import { NumberFieldRoot, useForwardPropsEmits } from "reka-ui";
import type { HTMLAttributes } from "vue";

import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";
import { cn } from "#/utils/lib/utils.ts";

const props = defineProps<
  NumberFieldRootProps & { class?: HTMLAttributes["class"] }
>();
const emits = defineEmits<NumberFieldRootEmits>();

const delegatedProps = reactiveOmit(props, "class");

const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <NumberFieldRoot
    v-slot="slotProps"
    v-bind="exactOptionalProps(forwarded)"
    :class="cn('grid gap-1.5', props.class)"
  >
    <slot v-bind="exactOptionalProps(slotProps)" />
  </NumberFieldRoot>
</template>
