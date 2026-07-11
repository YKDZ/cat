<script setup lang="ts">
import { reactiveOmit } from "@vueuse/core";
import type { ComboboxContentEmits, ComboboxContentProps } from "reka-ui";
import { ComboboxContent, ComboboxPortal, useForwardPropsEmits } from "reka-ui";
import type { HTMLAttributes } from "vue";

import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";
import { cn } from "#/utils/lib/utils.ts";

const props = withDefaults(
  defineProps<
    ComboboxContentProps & {
      class?: HTMLAttributes["class"];
      portal?: boolean;
    }
  >(),
  {
    position: "popper",
    side: "bottom",
    align: "center",
    sideOffset: 4,
    portal: true,
  },
);
const emits = defineEmits<ComboboxContentEmits>();

const delegatedProps = reactiveOmit(props, "class", "portal");
const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <ComboboxPortal :disabled="!portal">
    <ComboboxContent
      data-slot="combobox-list"
      v-bind="exactOptionalProps(forwarded)"
      :class="
        cn(
          'z-50 w-50 origin-(--reka-combobox-content-transform-origin) overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md outline-none data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          props.class,
        )
      "
    >
      <slot />
    </ComboboxContent>
  </ComboboxPortal>
</template>
