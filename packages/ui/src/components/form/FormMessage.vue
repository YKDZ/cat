<script lang="ts" setup>
import { ErrorMessage } from "vee-validate";
import type { HTMLAttributes } from "vue";
import { toValue } from "vue";

import { useFormField } from "#/components/form/useFormField.ts";
import { cn } from "#/utils/lib/utils.ts";

const props = defineProps<{
  class?: HTMLAttributes["class"];
}>();

const { name, formMessageId } = useFormField();
</script>

<template>
  <ErrorMessage
    :id="formMessageId"
    data-slot="form-message"
    as="p"
    :name="toValue(name)"
    :class="cn('text-sm text-destructive', props.class)"
  />
</template>
