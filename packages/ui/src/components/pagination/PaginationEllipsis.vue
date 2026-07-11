<script setup lang="ts">
import { MoreHorizontal } from "@lucide/vue";
import { reactiveOmit } from "@vueuse/core";
import type { PaginationEllipsisProps } from "reka-ui";
import { PaginationEllipsis } from "reka-ui";
import type { HTMLAttributes } from "vue";

import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";
import { cn } from "#/utils/lib/utils.ts";

const props = defineProps<
  PaginationEllipsisProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = reactiveOmit(props, "class");
</script>

<template>
  <PaginationEllipsis
    data-slot="pagination-ellipsis"
    v-bind="exactOptionalProps(delegatedProps)"
    :class="cn('flex size-9 items-center justify-center', props.class)"
  >
    <slot>
      <MoreHorizontal class="size-4" />
      <span class="sr-only">More pages</span>
    </slot>
  </PaginationEllipsis>
</template>
