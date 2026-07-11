<script setup lang="ts">
import { reactiveOmit } from "@vueuse/core";
import type { ComboboxEmptyProps } from "reka-ui";
import { ComboboxEmpty } from "reka-ui";
import type { HTMLAttributes } from "vue";

import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";
import { cn } from "#/utils/lib/utils.ts";

const props = defineProps<
  ComboboxEmptyProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = reactiveOmit(props, "class");
</script>

<template>
  <ComboboxEmpty
    data-slot="combobox-empty"
    v-bind="exactOptionalProps(delegatedProps)"
    :class="cn('py-6 text-center text-sm', props.class)"
  >
    <slot />
  </ComboboxEmpty>
</template>
