<!--
@shadcn-custom-component
description:Combobox selected item indicator，添加 ml-auto 样式使选中标记靠右显示
lastReviewed:2026-02-25
-->

<script setup lang="ts">
import type { ComboboxItemIndicatorProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { ComboboxItemIndicator, useForwardProps } from "reka-ui";
import { cn } from "@/utils/lib/utils";

const props = defineProps<ComboboxItemIndicatorProps & { class?: HTMLAttributes["class"] }>();

const delegatedProps = reactiveOmit(props, "class");

const forwarded = useForwardProps(delegatedProps);
</script>

<template>
  <ComboboxItemIndicator
    data-slot="combobox-item-indicator"
    v-bind="forwarded"
    :class="cn('ml-auto', props.class)"
  >
    <slot />
  </ComboboxItemIndicator>
</template>
