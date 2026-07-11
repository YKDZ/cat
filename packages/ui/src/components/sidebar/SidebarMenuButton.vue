<script setup lang="ts">
import { reactiveOmit } from "@vueuse/core";
import type { PrimitiveProps } from "reka-ui";
import type { Component } from "vue";
import type { HTMLAttributes } from "vue";

import SidebarMenuButtonChild from "#/components/sidebar/SidebarMenuButtonChild.vue";
import { useSidebar } from "#/components/sidebar/utils.ts";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "#/components/tooltip/index.ts";

interface SidebarMenuButtonProps extends PrimitiveProps {
  variant?: "default" | "outline";
  size?: "default" | "sm" | "lg";
  isActive?: boolean;
  class?: HTMLAttributes["class"];
  sidebarId: string;
}

defineOptions({
  inheritAttrs: false,
});

const props = withDefaults(
  defineProps<
    SidebarMenuButtonProps & {
      tooltip?: string | Component;
    }
  >(),
  {
    as: "button",
    variant: "default",
    size: "default",
  },
);

const { isMobile, state } = useSidebar(props.sidebarId);

const delegatedProps = reactiveOmit(props, "tooltip");
</script>

<template>
  <SidebarMenuButtonChild
    v-if="!tooltip"
    v-bind="{ ...delegatedProps, ...$attrs }"
  >
    <slot />
  </SidebarMenuButtonChild>

  <Tooltip v-else>
    <TooltipTrigger as-child>
      <SidebarMenuButtonChild v-bind="{ ...delegatedProps, ...$attrs }">
        <slot />
      </SidebarMenuButtonChild>
    </TooltipTrigger>
    <TooltipContent
      side="right"
      align="center"
      :hidden="state !== 'collapsed' || isMobile"
    >
      <template v-if="typeof tooltip === 'string'">
        {{ tooltip }}
      </template>
      <component :is="tooltip" v-else />
    </TooltipContent>
  </Tooltip>
</template>
