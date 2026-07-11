<script setup lang="ts">
import type { AvatarImageProps } from "reka-ui";
import { AvatarImage } from "reka-ui";

import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";

const props = defineProps<AvatarImageProps>();
</script>

<template>
  <AvatarImage
    data-slot="avatar-image"
    v-bind="exactOptionalProps(props)"
    class="aspect-square size-full"
  >
    <slot />
  </AvatarImage>
</template>
