<script setup lang="ts">
import { reactiveOmit } from "@vueuse/core";
import type { NavigationMenuIndicatorProps } from "reka-ui";
import { NavigationMenuIndicator, useForwardProps } from "reka-ui";
import type { HTMLAttributes } from "vue";

import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";
import { cn } from "#/utils/lib/utils.ts";

const props = defineProps<
  NavigationMenuIndicatorProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = reactiveOmit(props, "class");

const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <NavigationMenuIndicator
    data-slot="navigation-menu-indicator"
    v-bind="exactOptionalProps(forwardedProps)"
    :class="
      cn(
        'top-full z-[1] flex h-1.5 items-end justify-center overflow-hidden data-[state=hidden]:animate-out data-[state=hidden]:fade-out data-[state=visible]:animate-in data-[state=visible]:fade-in',
        props.class,
      )
    "
  >
    <div
      class="relative top-[60%] h-2 w-2 rotate-45 rounded-tl-sm bg-border shadow-md"
    />
  </NavigationMenuIndicator>
</template>
