<script setup lang="ts">
import { trpc } from "@/server/trpc/client";
import { usePageContext } from "vike-vue/usePageContext";
import { computed, onMounted, ref, shallowRef } from "vue";
import { navigate } from "vike/client/router";
import type { TRPCError } from "@trpc/server";
import { useAuthStore } from "@/app/stores/auth";
import Loading from "@/app/components/Loading.vue";
import JSONForm from "@/app/components/json-form/JSONForm.vue";
import Button from "@/app/components/Button.vue";
import { storeToRefs } from "pinia";
import { useToastStore } from "../stores/toast";
import type { JSONSchema } from "zod/v4/core";
import type { JSONType } from "@cat/shared";

const ctx = usePageContext();
const { error, authMethod } = storeToRefs(useAuthStore());
const { warn, info, trpcWarn } = useToastStore();
const schema = ref<JSONSchema.JSONSchema>({});
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
    .then(() => {
      navigate("/");
    })
    .catch((e: TRPCError) => {
      error.value = e;
      navigate("/auth");
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
    navigate("/auth");
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
    <Button
      full-width
      magic-key="Enter"
      @click="handleAuth"
      @magic-click="handleAuth"
      >{{ $t("登录") }}</Button
    >
  </div>
  <Loading v-else size="200px" />
</template>
