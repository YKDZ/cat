<script setup lang="ts">
import type { JSONSchema, NonNullJSONType } from "@cat/shared/schema/json";

import { Button } from "@cat/ui";
import { computed, onMounted, ref, shallowRef } from "vue";
import { useI18n } from "vue-i18n";

import JSONForm from "@/app/components/json-form/JsonForm.vue";
import { orpc } from "@/app/rpc/orpc";

import TotpVerifyForm from "../components/TotpVerifyForm.vue";

const props = defineProps<{
  mfaProviderId: number;
  userId: string;
}>();


const emits = defineEmits<{
  mfa: [];
}>();


const { t } = useI18n();


const schema = ref<JSONSchema>({});
const data = shallowRef<NonNullJSONType>({});


/**
 * 检测 schema 是否为 TOTP 类型（含 token 字段，且 token pattern 为 6 位数字）
 */
const isTotpSchema = computed(() => {
  const s = schema.value;
  if (
    typeof s === "object" &&
    s !== null &&
    "properties" in s &&
    typeof s.properties === "object" &&
    s.properties !== null &&
    "token" in s.properties
  ) {
    return true;
  }
  return false;
});


const isEmpty = computed(() => {
  return Object.keys(schema.value).length === 0;
});


const handleSubmitFormData = async (
  formData: NonNullJSONType,
): Promise<void> => {
  await orpc.auth.mfa({
    passToServer: {
      formData,
    },
  });
  emits("mfa");
};


const handleTotpSubmit = async (payload: { token: string }): Promise<void> => {
  await handleSubmitFormData(payload);
};


const handleUpdate = (to: NonNullJSONType): void => {
  data.value = to;
};


const handleJsonFormVerify = async (): Promise<void> => {
  const formData =
    typeof data.value === "object"
      ? {
          ...data.value,
        }
      : data.value;
  await handleSubmitFormData(formData);
};


onMounted(async () => {
  schema.value = await orpc.auth.getMfaFormSchema({
    mfaProviderId: props.mfaProviderId,
  });

  // 无需填表则直接验证
  if (isEmpty.value) {
    await handleSubmitFormData({});
  }
});
</script>

<template>
  <!-- TOTP 专用表单 -->
  <TotpVerifyForm v-if="isTotpSchema" @submit="handleTotpSubmit" />

  <!-- 通用 JSONForm 兜底 -->
  <div
    v-else-if="typeof schema === 'object' && !isEmpty"
    class="flex flex-col gap-1"
  >
    <JSONForm :schema :data @update="handleUpdate" />
    <Button
      magic-key="Enter"
      @click="handleJsonFormVerify"
      @magic-click="handleJsonFormVerify"
      >{{ t("验证") }}</Button
    >
  </div>
</template>
