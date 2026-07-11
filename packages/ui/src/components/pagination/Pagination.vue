<script setup lang="ts">
import { reactiveOmit } from "@vueuse/core";
import type { PaginationRootEmits, PaginationRootProps } from "reka-ui";
import { PaginationRoot, useForwardPropsEmits } from "reka-ui";
import type { HTMLAttributes } from "vue";

import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";
import { cn } from "#/utils/lib/utils.ts";

const props = defineProps<
  PaginationRootProps & {
    class?: HTMLAttributes["class"];
  }
>();
const emits = defineEmits<PaginationRootEmits>();

const delegatedProps = reactiveOmit(props, "class");
const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <PaginationRoot
    v-slot="slotProps"
    data-slot="pagination"
    v-bind="exactOptionalProps(forwarded)"
    :class="cn('mx-auto flex w-full justify-center', props.class)"
  >
    <slot v-bind="exactOptionalProps(slotProps)" />
  </PaginationRoot>
</template>
