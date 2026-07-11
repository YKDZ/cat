<script setup lang="ts">
import { reactiveOmit } from "@vueuse/core";
import type { TagsInputInputProps } from "reka-ui";
import { TagsInputInput, useForwardProps } from "reka-ui";
import type { HTMLAttributes } from "vue";

import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";
import { cn } from "#/utils/lib/utils.ts";

const props = defineProps<
  TagsInputInputProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = reactiveOmit(props, "class");

const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <TagsInputInput
    v-bind="exactOptionalProps(forwardedProps)"
    :class="
      cn(
        'min-h-5 flex-1 bg-transparent px-1 text-sm focus:outline-none',
        props.class,
      )
    "
  />
</template>
