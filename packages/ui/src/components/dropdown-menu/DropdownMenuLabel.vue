<script setup lang="ts">
import { reactiveOmit } from "@vueuse/core";
import type { DropdownMenuLabelProps } from "reka-ui";
import { DropdownMenuLabel, useForwardProps } from "reka-ui";
import type { HTMLAttributes } from "vue";

import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";
import { cn } from "#/utils/lib/utils.ts";

const props = defineProps<
  DropdownMenuLabelProps & { class?: HTMLAttributes["class"]; inset?: boolean }
>();

const delegatedProps = reactiveOmit(props, "class", "inset");
const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <DropdownMenuLabel
    data-slot="dropdown-menu-label"
    :data-inset="inset ? '' : undefined"
    v-bind="exactOptionalProps(forwardedProps)"
    :class="cn('px-2 py-1.5 text-sm font-medium data-inset:pl-8', props.class)"
  >
    <slot />
  </DropdownMenuLabel>
</template>
