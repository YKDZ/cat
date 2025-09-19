<script setup lang="ts">
import { usePageContext } from "vike-vue/usePageContext";
import { computed, onMounted, ref, shallowRef } from "vue";
import { navigate } from "vike/client/router";
import type { TRPCError } from "@trpc/server";
import { storeToRefs } from "pinia";
import type { JSONSchema, JSONType } from "@cat/shared/schema/json";
import { useI18n } from "vue-i18n";
import HButton from "./headless/HButton.vue";
import JSONForm from "@/app/components/json-form/JSONForm.vue";
import { useAuthStore } from "@/app/stores/auth.ts";
import { trpc } from "@cat/app-api/trpc/client";

const { t } = useI18n();

const ctx = usePageContext();
const { error, authMethod } = storeToRefs(useAuthStore());
const schema = ref<JSONSchema>({});
const data = shallowRef<JSONType>({});

const handleAuth = async () => {
  const formData =
    typeof data.value === "object"
      ? {
          ...data.value,
        }
      : data.value;
  await trpc.auth.auth
    .mutate({
      passToServer: {
        urlSearchParams: {
          ...ctx.urlParsed.search,
        },
        formData,
      },
    })
    .then(async () => {
      await navigate("/");
    })
    .catch(async (e: TRPCError) => {
      error.value = e;
      await navigate("/auth");
    });
};

const isEmpty = computed(() => {
  return Object.keys(schema.value).length === 0;
});

const handleUpdate = (to: JSONType) => {
  data.value = to;
};

onMounted(async () => {
  if (!authMethod.value?.providerId) {
    await navigate("/auth");
    return;
  }

  schema.value = await trpc.auth.queryAuthFormSchema.query({
    providerId: authMethod.value.providerId,
  });

  // 无需填表则直接登录
  // 否则需要手动按钮
  if (isEmpty.value) await handleAuth();
  authMethod.value = null;
});
</script>

<template>
  <div v-if="!isEmpty" class="flex flex-col gap-1">
    <JSONForm :schema :data @update="handleUpdate" />
    <HButton
      :classes="{
        base: 'btn btn-md btn-w-full btn-base btn-center',
      }"
      magic-key="Enter"
      @click="handleAuth"
      @magic-click="handleAuth"
      >{{ t("登录") }}</HButton
    >
  </div>
</template>
