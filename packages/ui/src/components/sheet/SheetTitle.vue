<script setup lang="ts">
import { reactiveOmit } from "@vueuse/core";
import type { DialogTitleProps } from "reka-ui";
import { DialogTitle } from "reka-ui";
import type { HTMLAttributes } from "vue";

import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";
import { cn } from "#/utils/lib/utils.ts";

const props = defineProps<
  DialogTitleProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = reactiveOmit(props, "class");
</script>

<template>
  <DialogTitle
    data-slot="sheet-title"
    :class="cn('font-semibold text-foreground', props.class)"
    v-bind="exactOptionalProps(delegatedProps)"
  >
    <slot />
  </DialogTitle>
</template>
