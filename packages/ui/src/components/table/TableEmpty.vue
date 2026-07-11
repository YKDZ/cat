<script setup lang="ts">
import { reactiveOmit } from "@vueuse/core";
import type { HTMLAttributes } from "vue";

import TableCell from "#/components/table/TableCell.vue";
import TableRow from "#/components/table/TableRow.vue";
import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";
import { cn } from "#/utils/lib/utils.ts";

const props = withDefaults(
  defineProps<{
    class?: HTMLAttributes["class"];
    colspan?: number;
  }>(),
  {
    colspan: 1,
  },
);

const delegatedProps = reactiveOmit(props, "class");
</script>

<template>
  <TableRow>
    <TableCell
      :class="
        cn(
          'p-4 align-middle text-sm whitespace-nowrap text-foreground',
          props.class,
        )
      "
      v-bind="exactOptionalProps(delegatedProps)"
    >
      <div class="flex items-center justify-center py-10">
        <slot />
      </div>
    </TableCell>
  </TableRow>
</template>
