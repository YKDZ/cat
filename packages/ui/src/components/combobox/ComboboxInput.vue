<script setup lang="ts">
import { SearchIcon } from "@lucide/vue";
import { reactiveOmit } from "@vueuse/core";
import type { ComboboxInputEmits, ComboboxInputProps } from "reka-ui";
import { ComboboxInput, useForwardPropsEmits } from "reka-ui";
import type { HTMLAttributes } from "vue";

import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";
import { cn } from "#/utils/lib/utils.ts";

defineOptions({
  inheritAttrs: false,
});

const props = defineProps<
  ComboboxInputProps & {
    class?: HTMLAttributes["class"];
  }
>();

const emits = defineEmits<ComboboxInputEmits>();

const delegatedProps = reactiveOmit(props, "class");

const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <div
    data-slot="command-input-wrapper"
    class="flex h-9 items-center gap-2 border-b px-3"
  >
    <SearchIcon class="size-4 shrink-0 opacity-50" />
    <ComboboxInput
      data-slot="command-input"
      :class="
        cn(
          'flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
          props.class,
        )
      "
      v-bind="exactOptionalProps({ ...forwarded, ...$attrs })"
    >
      <slot />
    </ComboboxInput>
  </div>
</template>
