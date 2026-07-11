<script lang="ts" setup>
import type { LabelProps } from "reka-ui";
import type { HTMLAttributes } from "vue";

import { useFormField } from "#/components/form/useFormField.ts";
import { Label } from "#/components/label/index.ts";
import { cn } from "#/utils/lib/utils.ts";

const props = defineProps<LabelProps & { class?: HTMLAttributes["class"] }>();

const { error, formItemId } = useFormField();
</script>

<template>
  <Label
    data-slot="form-label"
    :data-error="!!error"
    :class="cn('data-[error=true]:text-destructive', props.class)"
    :for="formItemId"
  >
    <slot />
  </Label>
</template>
