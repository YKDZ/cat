<script setup lang="ts">
import { reactiveOmit } from "@vueuse/core";
import type { PaginationListItemProps } from "reka-ui";
import { PaginationListItem } from "reka-ui";
import type { HTMLAttributes } from "vue";

import type { ButtonVariants } from "#/components/button/index.ts";
import { buttonVariants } from "#/components/button/index.ts";
import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";
import { cn } from "#/utils/lib/utils.ts";

const props = withDefaults(
  defineProps<
    PaginationListItemProps & {
      size?: ButtonVariants["size"];
      class?: HTMLAttributes["class"];
      isActive?: boolean;
    }
  >(),
  {
    size: "icon",
  },
);

const delegatedProps = reactiveOmit(props, "class", "size", "isActive");
</script>

<template>
  <PaginationListItem
    data-slot="pagination-item"
    v-bind="exactOptionalProps(delegatedProps)"
    :class="
      cn(
        buttonVariants({
          variant: isActive ? 'outline' : 'ghost',
          size,
        }),
        props.class,
      )
    "
  >
    <slot />
  </PaginationListItem>
</template>
