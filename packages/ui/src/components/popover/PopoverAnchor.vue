<script setup lang="ts">
import type { PopoverAnchorProps } from "reka-ui";
import { PopoverAnchor } from "reka-ui";

import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";

const props = defineProps<PopoverAnchorProps>();
</script>

<template>
  <PopoverAnchor data-slot="popover-anchor" v-bind="exactOptionalProps(props)">
    <slot />
  </PopoverAnchor>
</template>
