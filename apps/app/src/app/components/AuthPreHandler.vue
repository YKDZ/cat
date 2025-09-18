<script setup lang="ts">
import type { JSONSchema, JSONType } from "@cat/shared/schema/json";
import type { AuthMethod } from "@cat/shared/schema/misc";
import { computed, onMounted, ref, shallowRef } from "vue";
import { storeToRefs } from "pinia";
import { navigate } from "vike/client/router";
import { useI18n } from "vue-i18n";
import type { TRPCError } from "@trpc/server";
import JSONForm from "./json-form/JSONForm.vue";
import HButton from "./headless/HButton.vue";
import { useToastStore } from "@/app/stores/toast.ts";
import { useAuthStore } from "@/app/stores/auth.ts";
import { trpc } from "@/server/trpc/client.ts";

const { t } = useI18n();

const props = defineProps<{
  method: AuthMethod;
}>();

const { trpcWarn } = useToastStore();
const { authMethod } = storeToRefs(useAuthStore());

const schema = ref<JSONSchema>({});
const data = shallowRef<JSONType>({});

const isEmpty = computed(() => {
  return Object.keys(schema.value).length === 0;
});

const handlePreAuth = async () => {
  authMethod.value = props.method;

  await trpc.auth.preAuth
    .mutate({
      providerId: props.method.providerId,
      gotFromClient: {
        formData: data.value,
      },
    })
    .then(async (passToClient) => {
      if (
        !passToClient ||
        !passToClient.redirectURL ||
        typeof passToClient.redirectURL !== "string"
      )
        await navigate("/auth/callback");
      else await navigate(passToClient.redirectURL);
    })
    .catch(async (e: TRPCError) => {
      if (e.code === "CONFLICT") await navigate("/auth/callback");
      else trpcWarn(e);
    });
};

onMounted(async () => {
  schema.value = await trpc.auth.queryPreAuthFormSchema.query({
    providerId: props.method.providerId,
  });
});
</script>

<template>
  <JSONForm v-if="!isEmpty" :schema :data @update="(to) => (data = to)" />
  <HButton
    :data-testid="method.providerId"
    :classes="{
      base: 'btn btn-w-full btn-base btn-md btn-center',
    }"
    :icon="method.icon"
    @click="handlePreAuth"
  >
    {{ t("通过 {name} 登录", { name: method.name }) }}
  </HButton>
</template>
