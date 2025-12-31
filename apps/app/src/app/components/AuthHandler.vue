<script setup lang="ts">
import { usePageContext } from "vike-vue/usePageContext";
import { computed, onMounted, ref, shallowRef } from "vue";
import { navigate } from "vike/client/router";
import { storeToRefs } from "pinia";
import type { JSONSchema, NonNullJSONType } from "@cat/shared/schema/json";
import { useI18n } from "vue-i18n";
import { orpc } from "@/server/orpc";
import JSONForm from "@/app/components/json-form/JsonForm.vue";
import { useAuthStore } from "@/app/stores/auth.ts";
import { Button } from "@/app/components/ui/button";

const { t } = useI18n();

const ctx = usePageContext();
const { authMethod } = storeToRefs(useAuthStore());
const schema = ref<JSONSchema>({});
const data = shallowRef<NonNullJSONType>({});

const handleAuth = async (): Promise<void> => {
  const formData =
    typeof data.value === "object"
      ? {
          ...data.value,
        }
      : data.value;
  await orpc.auth
    .auth({
      passToServer: {
        urlSearchParams: {
          ...ctx.urlParsed.search,
        },
        formData,
      },
    })
    .then(async (result) => {
      if (result.status === "SUCCESS") await navigate("/");
      else if (result.status === "MFA_REQUIRED") await navigate("/auth/mfa");
    })
    .catch(async (e) => {
      await navigate("/auth");
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
    providerId: authMethod.value.providerId,
  });

  // 无需填表则直接登录
  // 否则需要手动按钮
  if (isEmpty.value) await handleAuth();
  authMethod.value = null;
});
</script>

<template>
  <div
    v-if="typeof schema === 'object' && !isEmpty"
    class="flex flex-col gap-1"
  >
    <JSONForm :schema :data @update="handleUpdate" />
    <Button magic-key="Enter" @click="handleAuth" @magic-click="handleAuth">{{
      t("登录")
    }}</Button>
  </div>
</template>
