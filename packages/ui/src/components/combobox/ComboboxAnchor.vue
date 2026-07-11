<script setup lang="ts">
import { reactiveOmit } from "@vueuse/core";
import type { ComboboxAnchorProps } from "reka-ui";
import { ComboboxAnchor, useForwardProps } from "reka-ui";
import type { HTMLAttributes } from "vue";

import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";
import { cn } from "#/utils/lib/utils.ts";

const props = defineProps<
  ComboboxAnchorProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = reactiveOmit(props, "class");

const forwarded = useForwardProps(delegatedProps);
</script>

<template>
  <ComboboxAnchor
    data-slot="combobox-anchor"
    v-bind="exactOptionalProps(forwarded)"
    :class="cn('inline-block', props.class)"
  >
    <slot />
  </ComboboxAnchor>
</template>
