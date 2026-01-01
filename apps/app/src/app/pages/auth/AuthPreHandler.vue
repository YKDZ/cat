<script setup lang="ts">
import type { AuthMethod } from "@cat/shared/schema/misc";
import { storeToRefs } from "pinia";
import { navigate } from "vike/client/router";
import { useI18n } from "vue-i18n";
import { orpc } from "@/server/orpc";
import { useToastStore } from "@/app/stores/toast.ts";
import { useAuthStore } from "@/app/stores/auth.ts";
import { Button } from "@/app/components/ui/button";

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
      authProviderId: props.method.providerId,
    })
    .then(async ({ gotFromServer, userId: authedUserId }) => {
      userId.value = authedUserId ?? null;

      if (!userId.value) {
        await navigate("/auth/register");
        return;
      }

      if (
        !gotFromServer ||
        !gotFromServer.redirectURL ||
        typeof gotFromServer.redirectURL !== "string"
      )
        await navigate("/auth/callback");
      else await navigate(gotFromServer.redirectURL);
    })
    .catch(async (e) => {
      if (e.code === "CONFLICT") await navigate("/auth/callback");
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
