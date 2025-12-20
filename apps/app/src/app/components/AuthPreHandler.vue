<script setup lang="ts">
import type { AuthMethod } from "@cat/shared/schema/misc";
import { storeToRefs } from "pinia";
import { navigate } from "vike/client/router";
import { useI18n } from "vue-i18n";
import type { TRPCError } from "@trpc/server";
import { trpc } from "@cat/app-api/trpc/client";
import { useToastStore } from "@/app/stores/toast.ts";
import { useAuthStore } from "@/app/stores/auth.ts";
import { Button } from "@/app/components/ui/button";

const { t } = useI18n();

const props = defineProps<{
  identifier: string;
  method: AuthMethod;
}>();

const { trpcWarn } = useToastStore();
const { authMethod } = storeToRefs(useAuthStore());

const handlePreAuth = async () => {
  authMethod.value = props.method;

  await trpc.auth.preAuth
    .mutate({
      identifier: props.identifier,
      authProviderId: props.method.providerId,
    })
    .then(async ({ gotFromServer, userId }) => {
      if (!userId) {
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
    .catch(async (e: TRPCError) => {
      if (e.code === "CONFLICT") await navigate("/auth/callback");
      else trpcWarn(e);
    });
};
</script>

<template>
  <Button :data-testid="method.providerId" @click="handlePreAuth">
    <div :class="method.icon" class="size-4" />
    {{ t("通过 {name} 登录", { name: method.name }) }}
  </Button>
</template>
