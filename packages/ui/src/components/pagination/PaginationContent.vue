<script setup lang="ts">
import { reactiveOmit } from "@vueuse/core";
import type { PaginationListProps } from "reka-ui";
import { PaginationList } from "reka-ui";
import type { HTMLAttributes } from "vue";

import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";
import { cn } from "#/utils/lib/utils.ts";

const props = defineProps<
  PaginationListProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = reactiveOmit(props, "class");
</script>

<template>
  <PaginationList
    v-slot="slotProps"
    data-slot="pagination-content"
    v-bind="exactOptionalProps(delegatedProps)"
    :class="cn('flex flex-row items-center gap-1', props.class)"
  >
    <slot v-bind="exactOptionalProps(slotProps)" />
  </PaginationList>
</template>
