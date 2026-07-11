<script setup lang="ts">
import { reactiveOmit } from "@vueuse/core";
import type { NavigationMenuItemProps } from "reka-ui";
import { NavigationMenuItem } from "reka-ui";
import type { HTMLAttributes } from "vue";

import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";
import { cn } from "#/utils/lib/utils.ts";

const props = defineProps<
  NavigationMenuItemProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = reactiveOmit(props, "class");
</script>

<template>
  <NavigationMenuItem
    data-slot="navigation-menu-item"
    v-bind="exactOptionalProps(delegatedProps)"
    :class="cn('relative', props.class)"
  >
    <slot />
  </NavigationMenuItem>
</template>
