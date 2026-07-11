<script setup lang="ts">
import { reactiveOmit } from "@vueuse/core";
import type { DropdownMenuSeparatorProps } from "reka-ui";
import { DropdownMenuSeparator } from "reka-ui";
import type { HTMLAttributes } from "vue";

import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";
import { cn } from "#/utils/lib/utils.ts";

const props = defineProps<
  DropdownMenuSeparatorProps & {
    class?: HTMLAttributes["class"];
  }
>();

const delegatedProps = reactiveOmit(props, "class");
</script>

<template>
  <DropdownMenuSeparator
    data-slot="dropdown-menu-separator"
    v-bind="exactOptionalProps(delegatedProps)"
    :class="cn('-mx-1 my-1 h-px bg-border', props.class)"
  />
</template>
