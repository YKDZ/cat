<script setup lang="ts">
import { trpc } from "@/server/trpc/client";
import type { AuthMethod } from "@cat/shared";
import { onMounted, ref } from "vue";
import { useAuthStore } from "../stores/auth";
import { storeToRefs } from "pinia";
import { useToastStore } from "../stores/toast";
import { navigate } from "vike/client/router";
import JSONForm from "./json-form/JSONForm.vue";
import Button from "./Button.vue";

const props = defineProps<{
  method: AuthMethod;
}>();

const { info, trpcWarn } = useToastStore();
const { authMethod } = storeToRefs(useAuthStore());

const schema = ref("{}");
const data = ref({});

const handlePreAuth = async () => {
  authMethod.value = props.method;

  await trpc.auth.preAuth
    .mutate({
      providerId: props.method.providerId,
      gotFromClient: data.value,
    })
    .then((passToClient) => {
      if (
        !passToClient ||
        !passToClient.redirectURL ||
        typeof passToClient.redirectURL !== "string"
      )
        navigate("/auth/oidc.callback");
      else window.location.href = passToClient.redirectURL;
    })
    .catch(trpcWarn);
};

onMounted(async () => {
  schema.value = await trpc.auth.queryPreAuthFormSchema.query({
    providerId: props.method.providerId,
  });
});
</script>

<template>
  <div>
    <JSONForm
      v-if="schema !== '{}'"
      :schema
      :data
      @update="(to) => (data = to)"
    />
    <Button
      full-width
      :icon="method.icon"
      magic-key="Enter"
      @magic-click="handlePreAuth"
      @click="handlePreAuth"
      >通过 {{ method.name }} 登录</Button
    >
  </div>
</template>
