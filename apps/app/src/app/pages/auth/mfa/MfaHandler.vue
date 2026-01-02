<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from "vue";
import { navigate } from "vike/client/router";
import type { JSONSchema, NonNullJSONType } from "@cat/shared/schema/json";
import { useI18n } from "vue-i18n";
import { orpc } from "@/server/orpc";
import JSONForm from "@/app/components/json-form/JsonForm.vue";
import { useAuthStore } from "@/app/stores/auth.ts";
import { Button } from "@/app/components/ui/button";
import { storeToRefs } from "pinia";

const emits = defineEmits<{
  mfa: [];
}>();

const { t } = useI18n();

const { authMethod } = storeToRefs(useAuthStore());
const schema = ref<JSONSchema>({});
const data = shallowRef<NonNullJSONType>({});

const handleVerify = async (): Promise<void> => {
  const formData =
    typeof data.value === "object"
      ? {
          ...data.value,
        }
      : data.value;
  await orpc.auth.mfa({
    passToServer: {
      formData,
    },
  });
};

const isEmpty = computed(() => {
  return Object.keys(schema.value).length === 0;
});

const handleUpdate = (to: NonNullJSONType): void => {
  data.value = to;
};

onMounted(async () => {
  if (!authMethod.value?.providerId) {
    await navigate("/auth");
    return;
  }

  schema.value = await orpc.auth.getAuthFormSchema({
    providerId: authMethod.value.providerDBId,
  });

  // 无需填表则直接验证
  // 否则需要手动按钮
  if (isEmpty.value) await handleVerify();
  authMethod.value = null;

  emits("mfa");
});
</script>

<template>
  <div
    v-if="typeof schema === 'object' && !isEmpty"
    class="flex flex-col gap-1"
  >
    <JSONForm :schema :data @update="handleUpdate" />
    <Button
      magic-key="Enter"
      @click="handleVerify"
      @magic-click="handleVerify"
      >{{ t("验证") }}</Button
    >
  </div>
</template>
