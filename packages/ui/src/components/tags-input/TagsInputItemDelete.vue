<script setup lang="ts">
import { X } from "@lucide/vue";
import { reactiveOmit } from "@vueuse/core";
import type { TagsInputItemDeleteProps } from "reka-ui";
import { TagsInputItemDelete, useForwardProps } from "reka-ui";
import type { HTMLAttributes } from "vue";

import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";
import { cn } from "#/utils/lib/utils.ts";

const props = defineProps<
  TagsInputItemDeleteProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = reactiveOmit(props, "class");

const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <TagsInputItemDelete
    v-bind="exactOptionalProps(forwardedProps)"
    :class="cn('mr-1 flex rounded bg-transparent', props.class)"
  >
    <slot>
      <X class="h-4 w-4" />
    </slot>
  </TagsInputItemDelete>
</template>
