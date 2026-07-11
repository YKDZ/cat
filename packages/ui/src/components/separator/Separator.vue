<script setup lang="ts">
import { reactiveOmit } from "@vueuse/core";
import type { SeparatorProps } from "reka-ui";
import { Separator } from "reka-ui";
import type { HTMLAttributes } from "vue";

import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";
import { cn } from "#/utils/lib/utils.ts";

const props = withDefaults(
  defineProps<SeparatorProps & { class?: HTMLAttributes["class"] }>(),
  {
    orientation: "horizontal",
    decorative: true,
  },
);

const delegatedProps = reactiveOmit(props, "class");
</script>

<template>
  <Separator
    data-slot="separator"
    v-bind="exactOptionalProps(delegatedProps)"
    :class="
      cn(
        'shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px',
        props.class,
      )
    "
  />
</template>
