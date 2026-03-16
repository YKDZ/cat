<!--
@shadcn-custom-component
description:separate Combobox scrolling viewport，支持自定义最大高度和滚动样式，与 ComboboxVirtualizer 配合使用
lastReviewed:2026-02-25
-->

<script setup lang="ts">
import type { ComboboxViewportProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { ComboboxViewport, useForwardProps } from "reka-ui";
import { cn } from "@/utils/lib/utils";

const props = defineProps<ComboboxViewportProps & { class?: HTMLAttributes["class"] }>();

const delegatedProps = reactiveOmit(props, "class");

const forwarded = useForwardProps(delegatedProps);
</script>

<template>
  <ComboboxViewport
    data-slot="combobox-viewport"
    v-bind="forwarded"
    :class="cn('max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto', props.class)"
  >
    <slot />
  </ComboboxViewport>
</template>
