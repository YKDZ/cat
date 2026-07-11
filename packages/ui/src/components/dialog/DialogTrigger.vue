<script setup lang="ts">
import type { DialogTriggerProps } from "reka-ui";
import { DialogTrigger } from "reka-ui";

import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";

const props = defineProps<DialogTriggerProps>();
</script>

<template>
  <DialogTrigger data-slot="dialog-trigger" v-bind="exactOptionalProps(props)">
    <slot />
  </DialogTrigger>
</template>
