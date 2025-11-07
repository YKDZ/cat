<script setup lang="ts">
import type { JSONSchema, NonNullJSONType } from "@cat/shared/schema/json";
import type { AuthMethod } from "@cat/shared/schema/misc";
import { computed, onMounted, ref, shallowRef } from "vue";
import { storeToRefs } from "pinia";
import { navigate } from "vike/client/router";
import { useI18n } from "vue-i18n";
import type { TRPCError } from "@trpc/server";
import { trpc } from "@cat/app-api/trpc/client";
import JSONForm from "./json-form/JsonForm.vue";
import { useToastStore } from "@/app/stores/toast.ts";
import { useAuthStore } from "@/app/stores/auth.ts";
import { Button } from "@/app/components/ui/button";

const { t } = useI18n();

const props = defineProps<{
  method: AuthMethod;
}>();

const { trpcWarn } = useToastStore();
const { authMethod } = storeToRefs(useAuthStore());

const schema = ref<JSONSchema>({});
const data = shallowRef<NonNullJSONType>({});

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
  <JSONForm
    v-if="typeof schema === 'object' && !isEmpty"
    :schema
    :data
    @update="(to) => (data = to)"
  />
  <Button :data-testid="method.providerId" @click="handlePreAuth">
    <div :class="method.icon" class="size-4" />
    {{ t("通过 {name} 登录", { name: method.name }) }}
  </Button>
</template>
