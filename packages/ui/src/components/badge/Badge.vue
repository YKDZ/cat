<script setup lang="ts">
import { reactiveOmit } from "@vueuse/core";
import type { PrimitiveProps } from "reka-ui";
import { Primitive } from "reka-ui";
import type { HTMLAttributes } from "vue";

import type { BadgeVariants } from "#/components/badge/index.ts";
import { badgeVariants } from "#/components/badge/index.ts";
import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";
import { cn } from "#/utils/lib/utils.ts";

const props = defineProps<
  PrimitiveProps & {
    variant?: BadgeVariants["variant"];
    class?: HTMLAttributes["class"];
  }
>();

const delegatedProps = reactiveOmit(props, "class");
</script>

<template>
  <Primitive
    data-slot="badge"
    :class="cn(badgeVariants({ variant }), props.class)"
    v-bind="exactOptionalProps(delegatedProps)"
  >
    <slot />
  </Primitive>
</template>
