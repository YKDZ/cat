<script setup lang="ts">
import type { AuthMethod } from "@cat/shared/schema/misc";

import { Button } from "@cat/ui";
import { storeToRefs } from "pinia";
import { navigate } from "vike/client/router";
import { useI18n } from "vue-i18n";

import { orpc } from "@/app/rpc/orpc";
import { useAuthStore } from "@/app/stores/auth.ts";
import { useToastStore } from "@/app/stores/toast.ts";

const { t } = useI18n();


const props = defineProps<{
  identifier: string;
  method: AuthMethod;
}>();


const { rpcWarn } = useToastStore();
const { authMethod, userId } = storeToRefs(useAuthStore());


const handlePreAuth = async () => {
  authMethod.value = props.method;


  await orpc.auth
    .preAuth({
      identifier: props.identifier,
      authProviderId: props.method.providerDBId,
    })
    .then(async ({ gotFromServer, userId: authedUserId }) => {
      userId.value = authedUserId ?? null;

      if (!userId.value) {
        await navigate("/auth/register");
        return;
      }

      await navigate("/auth/callback");
    })
    .catch(async (e) => {
      if (e.code === "CONFLICT") await navigate("/");
      else rpcWarn(e);
    });
};
</script>

<template>
  <Button :data-testid="method.providerId" @click="handlePreAuth">
    <div :class="method.icon" class="size-4" />
    {{ t("通过 {name} 登录", { name: method.name }) }}
  </Button>
</template>
