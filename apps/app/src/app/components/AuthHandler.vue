<script setup lang="ts">
import { trpc } from "@/server/trpc/client";
import { usePageContext } from "vike-vue/usePageContext";
import { onMounted, ref } from "vue";
import { navigate } from "vike/client/router";
import type { TRPCError } from "@trpc/server";
import { useAuthStore } from "@/app/stores/auth";
import Loading from "@/app/components/Loading.vue";
import { useCookies } from "@vueuse/integrations/useCookies";
import JSONForm from "@/app/components/json-form/JSONForm.vue";
import Button from "@/app/components/Button.vue";
import { storeToRefs } from "pinia";
import { useToastStore } from "../stores/toast";

const ctx = usePageContext();
const { error, authMethod } = storeToRefs(useAuthStore());
const { warn, info, trpcWarn } = useToastStore();
const cookies = useCookies(["preAuthSessionId"]);
const schema = ref("{}");
const data = ref({});

const handleAuth = async () => {
  await trpc.auth.auth
    .mutate({
      passToServer: {
        ...ctx.urlParsed.search,
        ...data.value,
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
  if (schema.value === "{}") await handleAuth();
  authMethod.value = null;
});
</script>

<template>
  <div v-if="schema !== `{}`" class="flex flex-col gap-1">
    <JSONForm :schema :data @update="(to) => (data = to)" />
    <Button
      full-width
      magic-key="Enter"
      @click="handleAuth"
      @magic-click="handleAuth"
      >登录</Button
    >
  </div>
  <Loading v-else size="200px" />
</template>
