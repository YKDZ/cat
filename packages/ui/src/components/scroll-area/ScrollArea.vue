<script setup lang="ts">
import { reactiveOmit } from "@vueuse/core";
import type { ScrollAreaRootProps } from "reka-ui";
import { ScrollAreaCorner, ScrollAreaRoot, ScrollAreaViewport } from "reka-ui";
import type { HTMLAttributes } from "vue";

import ScrollBar from "#/components/scroll-area/ScrollBar.vue";
import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";
import { cn } from "#/utils/lib/utils.ts";

const props = defineProps<
  ScrollAreaRootProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = reactiveOmit(props, "class");
</script>

<template>
  <ScrollAreaRoot
    data-slot="scroll-area"
    v-bind="exactOptionalProps(delegatedProps)"
    :class="cn('relative', props.class)"
  >
    <ScrollAreaViewport
      data-slot="scroll-area-viewport"
      class="size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 [&>div]:min-h-full"
    >
      <slot />
    </ScrollAreaViewport>
    <ScrollBar />
    <ScrollAreaCorner />
  </ScrollAreaRoot>
</template>
