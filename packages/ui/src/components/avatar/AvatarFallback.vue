<script setup lang="ts">
import { reactiveOmit } from "@vueuse/core";
import type { AvatarFallbackProps } from "reka-ui";
import { AvatarFallback } from "reka-ui";
import type { HTMLAttributes } from "vue";

import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";
import { cn } from "#/utils/lib/utils.ts";

const props = defineProps<
  AvatarFallbackProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = reactiveOmit(props, "class");
</script>

<template>
  <AvatarFallback
    data-slot="avatar-fallback"
    v-bind="exactOptionalProps(delegatedProps)"
    :class="
      cn(
        'flex size-full items-center justify-center rounded-full bg-muted',
        props.class,
      )
    "
  >
    <slot />
  </AvatarFallback>
</template>
