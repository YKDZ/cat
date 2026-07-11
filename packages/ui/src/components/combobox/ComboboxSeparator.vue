<script setup lang="ts">
import { reactiveOmit } from "@vueuse/core";
import type { ComboboxSeparatorProps } from "reka-ui";
import { ComboboxSeparator } from "reka-ui";
import type { HTMLAttributes } from "vue";

import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";
import { cn } from "#/utils/lib/utils.ts";

const props = defineProps<
  ComboboxSeparatorProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = reactiveOmit(props, "class");
</script>

<template>
  <ComboboxSeparator
    data-slot="combobox-separator"
    v-bind="exactOptionalProps(delegatedProps)"
    :class="cn('-mx-1 h-px bg-border', props.class)"
  >
    <slot />
  </ComboboxSeparator>
</template>
