<script setup lang="ts">
import { reactiveOmit } from "@vueuse/core";
import type { DialogDescriptionProps } from "reka-ui";
import { DialogDescription } from "reka-ui";
import type { HTMLAttributes } from "vue";

import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";
import { cn } from "#/utils/lib/utils.ts";

const props = defineProps<
  DialogDescriptionProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = reactiveOmit(props, "class");
</script>

<template>
  <DialogDescription
    data-slot="sheet-description"
    :class="cn('text-sm text-muted-foreground', props.class)"
    v-bind="exactOptionalProps(delegatedProps)"
  >
    <slot />
  </DialogDescription>
</template>
