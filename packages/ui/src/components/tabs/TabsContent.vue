<script setup lang="ts">
import { reactiveOmit } from "@vueuse/core";
import type { TabsContentProps } from "reka-ui";
import { TabsContent } from "reka-ui";
import type { HTMLAttributes } from "vue";

import { exactOptionalProps } from "#/utils/lib/exact-optional-props.ts";
import { cn } from "#/utils/lib/utils.ts";

const props = defineProps<
  TabsContentProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = reactiveOmit(props, "class");
</script>

<template>
  <TabsContent
    data-slot="tabs-content"
    :class="cn('flex-1 outline-none', props.class)"
    v-bind="exactOptionalProps(delegatedProps)"
  >
    <slot />
  </TabsContent>
</template>
