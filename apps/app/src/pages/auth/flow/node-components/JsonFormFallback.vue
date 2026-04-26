<script setup lang="ts">
import type { _JSONSchema, NonNullJSONType } from "@cat/shared";

import { Button } from "@cat/ui";
import { shallowRef } from "vue";
import { useI18n } from "vue-i18n";

import JSONForm from "@/components/json-form/JsonForm.vue";

/**
 * @zh JsonFormFallback 的 props。
 * @en Props for the JsonFormFallback node component.
 */
const props = defineProps<{
  /**
   * @zh 来自认证流节点的客户端提示信息（含 formSchema）。
   * @en Client hint from the auth flow node (may contain formSchema).
   */
  hint?: {
    displayInfo?: {
      title?: string;
      description?: string;
      formSchema?: Record<string, unknown>;
    };
  };
}>();

/**
 * @zh 用户提交表单数据时触发。
 * @en Emitted when user submits the form data.
 */
const emit = defineEmits<{
  (e: "submit", data: Record<string, unknown>): void;
}>();

const { t } = useI18n();

const data = shallowRef<NonNullJSONType>({});

const handleUpdate = (to: NonNullJSONType): void => {
  data.value = to;
};

const onSubmit = (): void => {
  emit(
    "submit",
    typeof data.value === "object" && data.value !== null
      ? { ...data.value }
      : {},
  );
};
</script>

<template>
  <div class="flex flex-col gap-4">
    <div
      v-if="hint?.displayInfo?.description"
      class="text-sm text-muted-foreground"
    >
      {{ hint.displayInfo.description }}
    </div>
    <JSONForm
      v-if="hint?.displayInfo?.formSchema"
      :schema="hint.displayInfo.formSchema as _JSONSchema"
      :data
      @update="handleUpdate"
    />
    <Button class="w-full" @click="onSubmit">{{ t("提交") }}</Button>
  </div>
</template>
