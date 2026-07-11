<script setup lang="ts">
import type { AspectRatioProps } from "reka-ui";
import { AspectRatio } from "reka-ui";

import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";

const props = defineProps<AspectRatioProps>();
</script>

<template>
  <AspectRatio
    v-slot="slotProps"
    data-slot="aspect-ratio"
    v-bind="exactOptionalProps(props)"
  >
    <slot v-bind="exactOptionalProps(slotProps)" />
  </AspectRatio>
</template>
