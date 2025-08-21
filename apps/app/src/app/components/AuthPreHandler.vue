<script setup lang="ts">
import { trpc } from "@/server/trpc/client";
import type { AuthMethod, JSONType } from "@cat/shared";
import { computed, onMounted, ref, shallowRef } from "vue";
import { useAuthStore } from "../stores/auth";
import { storeToRefs } from "pinia";
import { useToastStore } from "../stores/toast";
import { navigate } from "vike/client/router";
import JSONForm from "./json-form/JSONForm.vue";
import Button from "./Button.vue";
import type { JSONSchema } from "zod/v4/core";

const props = defineProps<{
  method: AuthMethod;
}>();

const { trpcWarn } = useToastStore();
const { authMethod } = storeToRefs(useAuthStore());

const schema = ref<JSONSchema.JSONSchema>({});
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
    .then((passToClient) => {
      if (
        !passToClient ||
        !passToClient.redirectURL ||
        typeof passToClient.redirectURL !== "string"
      )
        navigate("/auth/callback");
      else window.location.href = passToClient.redirectURL;
    })
    .catch(trpcWarn);
};

onMounted(async () => {
  schema.value = await trpc.auth.queryPreAuthFormSchema.query({
    providerId: props.method.providerId,
    pluginId: props.method.pluginId,
  });
});
</script>

<template>
  <div>
    <JSONForm v-if="!isEmpty" :schema :data @update="(to) => (data = to)" />
    <Button
      :id="method.providerId"
      full-width
      :icon="method.icon"
      @magic-click="handlePreAuth"
      @click="handlePreAuth"
    >
      {{ $t("通过 {name} 登录", { name: method.name }) }}
    </Button>
  </div>
</template>
