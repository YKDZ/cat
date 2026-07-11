<script setup lang="ts">
import { reactiveOmit } from "@vueuse/core";
import type { AccordionItemProps } from "reka-ui";
import { AccordionItem, useForwardProps } from "reka-ui";
import type { HTMLAttributes } from "vue";

import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";
import { cn } from "#/utils/lib/utils.ts";

const props = defineProps<
  AccordionItemProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = reactiveOmit(props, "class");

const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <AccordionItem
    v-slot="slotProps"
    data-slot="accordion-item"
    v-bind="exactOptionalProps(forwardedProps)"
    :class="cn('border-b last:border-b-0', props.class)"
  >
    <slot v-bind="exactOptionalProps(slotProps)" />
  </AccordionItem>
</template>
