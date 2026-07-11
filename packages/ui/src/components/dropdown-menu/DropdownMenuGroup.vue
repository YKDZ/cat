<script setup lang="ts">
import type { DropdownMenuGroupProps } from "reka-ui";
import { DropdownMenuGroup } from "reka-ui";

import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";

const props = defineProps<DropdownMenuGroupProps>();
</script>

<template>
  <DropdownMenuGroup
    data-slot="dropdown-menu-group"
    v-bind="exactOptionalProps(props)"
  >
    <slot />
  </DropdownMenuGroup>
</template>
