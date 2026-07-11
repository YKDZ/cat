<script setup lang="ts">
import { reactiveOmit } from "@vueuse/core";
import type { TagsInputItemTextProps } from "reka-ui";
import { TagsInputItemText, useForwardProps } from "reka-ui";
import type { HTMLAttributes } from "vue";

import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";
import { cn } from "#/utils/lib/utils.ts";

const props = defineProps<
  TagsInputItemTextProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = reactiveOmit(props, "class");

const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <TagsInputItemText
    v-bind="exactOptionalProps(forwardedProps)"
    :class="cn('rounded bg-transparent px-2 py-0.5 text-sm', props.class)"
  >
    <slot />
  </TagsInputItemText>
</template>
