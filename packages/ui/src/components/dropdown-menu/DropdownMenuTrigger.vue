<script setup lang="ts">
import type { DropdownMenuTriggerProps } from "reka-ui";
import { DropdownMenuTrigger, useForwardProps } from "reka-ui";

import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";

const props = defineProps<DropdownMenuTriggerProps>();

const forwardedProps = useForwardProps(props);
</script>

<template>
  <DropdownMenuTrigger
    data-slot="dropdown-menu-trigger"
    v-bind="exactOptionalProps(forwardedProps)"
  >
    <slot />
  </DropdownMenuTrigger>
</template>
