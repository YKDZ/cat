<script lang="ts" setup>
import type { HTMLAttributes } from "vue";

import { useFormField } from "#/components/form/useFormField.ts";
import { cn } from "#/utils/lib/utils.ts";

const props = defineProps<{
  class?: HTMLAttributes["class"];
}>();

const { formDescriptionId } = useFormField();
</script>

<template>
  <p
    :id="formDescriptionId"
    data-slot="form-description"
    :class="cn('text-sm text-muted-foreground', props.class)"
  >
    <slot />
  </p>
</template>
