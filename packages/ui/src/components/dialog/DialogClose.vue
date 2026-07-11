<script setup lang="ts">
import type { DialogCloseProps } from "reka-ui";
import { DialogClose } from "reka-ui";

import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";

const props = defineProps<DialogCloseProps>();
</script>

<template>
  <DialogClose data-slot="dialog-close" v-bind="exactOptionalProps(props)">
    <slot />
  </DialogClose>
</template>
