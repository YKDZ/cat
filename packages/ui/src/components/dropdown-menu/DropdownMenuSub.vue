<script setup lang="ts">
import type { DropdownMenuSubEmits, DropdownMenuSubProps } from "reka-ui";
import { DropdownMenuSub, useForwardPropsEmits } from "reka-ui";

import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";

const props = defineProps<DropdownMenuSubProps>();
const emits = defineEmits<DropdownMenuSubEmits>();

const forwarded = useForwardPropsEmits(props, emits);
</script>

<template>
  <DropdownMenuSub
    data-slot="dropdown-menu-sub"
    v-bind="exactOptionalProps(forwarded)"
  >
    <slot />
  </DropdownMenuSub>
</template>
