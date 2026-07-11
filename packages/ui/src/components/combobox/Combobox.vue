<script setup lang="ts">
import type { ComboboxRootEmits, ComboboxRootProps } from "reka-ui";
import { ComboboxRoot, useForwardPropsEmits } from "reka-ui";

import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";

const props = defineProps<ComboboxRootProps>();
const emits = defineEmits<ComboboxRootEmits>();

const forwarded = useForwardPropsEmits(props, emits);
</script>

<template>
  <ComboboxRoot data-slot="combobox" v-bind="exactOptionalProps(forwarded)">
    <slot />
  </ComboboxRoot>
</template>
