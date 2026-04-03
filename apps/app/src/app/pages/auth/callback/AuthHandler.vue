<script setup lang="ts">
import type { JSONSchema, NonNullJSONType } from "@cat/shared/schema/json";

import { Button } from "@cat/ui";
import { storeToRefs } from "pinia";
import { usePageContext } from "vike-vue/usePageContext";
import { navigate } from "vike/client/router";
import { computed, onMounted, ref, shallowRef } from "vue";
import { useI18n } from "vue-i18n";

import JSONForm from "@/app/components/json-form/JsonForm.vue";
import { orpc } from "@/app/rpc/orpc";
import { useAuthStore } from "@/app/stores/auth.ts";

import PasswordLoginForm from "../components/PasswordLoginForm.vue";

const { t } = useI18n();


const ctx = usePageContext();
const { authMethod } = storeToRefs(useAuthStore());
const schema = ref<JSONSchema>({});
const data = shallowRef<NonNullJSONType>({});


const isEmpty = computed(() => Object.keys(schema.value).length === 0);


const handleUpdate = (to: NonNullJSONType): void => {
  data.value = to;
};


const handleAuthResult = async (result: { status: string }): Promise<void> => {
  if (result.status === "SUCCESS") await navigate("/");
  else if (result.status === "MFA_REQUIRED") await navigate("/auth/mfa");
};


const submitAuth = async (formData?: NonNullJSONType): Promise<void> => {
  await orpc.auth
    .auth({
      passToServer: {
        urlSearchParams: { ...ctx.urlParsed.search },
        formData:
          formData ??
          (typeof data.value === "object" ? { ...data.value } : data.value),
      },
    })
    .then(handleAuthResult)
    .catch(async () => {
      await navigate("/auth");
    });
};


const handlePasswordSubmit = async (formData: {
  password: string;
}): Promise<void> => {
  await submitAuth(formData);
};


onMounted(async () => {
  if (!authMethod.value?.providerId) {
    await navigate("/auth");
    return;
  }

  // CREDENTIAL / 其他类型：加载 form schema
  schema.value = await orpc.auth.getAuthFormSchema({
    providerId: authMethod.value.providerDBId,
  });

  // 无需填表则直接登录（如 passkey 等无额外输入的场景）
  if (isEmpty.value) {
    authMethod.value = null;
    await submitAuth();
  }
  authMethod.value = null;
});
</script>

<template>
  <!-- CREDENTIAL 类型：密码登录专用表单 -->
  <PasswordLoginForm
    v-if="authMethod?.flowType === 'CREDENTIAL'"
    @submit="handlePasswordSubmit"
  />

  <!-- Fallback：flowType 未知或表单有额外字段时使用 JSONForm -->
  <div
    v-else-if="typeof schema === 'object' && !isEmpty"
    class="flex flex-col gap-1"
  >
    <JSONForm :schema :data @update="handleUpdate" />
    <Button
      magic-key="Enter"
      @click="() => submitAuth()"
      @magic-click="() => submitAuth()"
    >
      {{ t("登录") }}
    </Button>
  </div>
</template>
