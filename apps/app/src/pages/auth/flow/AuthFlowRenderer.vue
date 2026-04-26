<script setup lang="ts">
import { storeToRefs } from "pinia";
import { navigate } from "vike/client/router";
import { computed, onMounted, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";

import { reconnectWs } from "@/rpc/ws";
import { useAuthFlowStore } from "@/stores/auth-flow.ts";

import IdentifierInput from "./node-components/IdentifierInput.vue";
import JsonFormFallback from "./node-components/JsonFormFallback.vue";
import OtpInput from "./node-components/OtpInput.vue";
import PasswordInput from "./node-components/PasswordInput.vue";
import TotpInput from "./node-components/TotpInput.vue";
import WebAuthnPrompt from "./node-components/WebAuthnPrompt.vue";

/**
 * @zh AuthFlowRenderer 的 props。
 * @en Props for AuthFlowRenderer component.
 */
const props = defineProps<{
  /**
   * @zh 要初始化的认证流类型。
   * @en The auth flow type to initialize.
   */
  flowType: "login" | "register";
}>();

const { t } = useI18n();

const store = useAuthFlowStore();
const { status, currentNode, progress, error, loading, sessionCreated } =
  storeToRefs(store);

const componentMap: Record<string, ReturnType<typeof shallowRef>> = {
  identifier_input: shallowRef(IdentifierInput),
  password_input: shallowRef(PasswordInput),
  totp_input: shallowRef(TotpInput),
  webauthn_prompt: shallowRef(WebAuthnPrompt),
  otp_input: shallowRef(OtpInput),
  json_form: shallowRef(JsonFormFallback),
};

const activeComponent = computed(() => {
  const componentType = currentNode.value?.hint?.componentType;
  if (!componentType) return null;
  return componentMap[componentType]?.value ?? JsonFormFallback;
});

const handleSubmit = async (input: Record<string, unknown>): Promise<void> => {
  await store.advanceFlow(input);
};

watch(sessionCreated, async (val) => {
  if (val) {
    reconnectWs();
    await navigate("/");
  }
});

onMounted(async () => {
  store.reset();
  await store.initFlow(props.flowType);
});
</script>

<template>
  <div class="flex w-full flex-col gap-4">
    <!-- Progress indicator -->
    <div v-if="status !== 'idle'" class="flex gap-1">
      <div
        v-for="step in progress.totalEstimatedSteps"
        :key="step"
        class="h-1 flex-1 rounded-full"
        :class="step <= progress.completedSteps ? 'bg-primary' : 'bg-muted'"
      />
    </div>

    <!-- Error message -->
    <div
      v-if="error"
      class="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
    >
      {{ error.message }}
    </div>

    <!-- Loading state -->
    <div v-if="loading && !currentNode" class="flex justify-center py-8">
      <span class="text-sm text-muted-foreground">{{ t("加载中…") }}</span>
    </div>

    <!-- Current node component -->
    <component
      :is="activeComponent"
      v-if="activeComponent && !loading"
      :hint="currentNode?.hint"
      @submit="handleSubmit"
    />

    <!-- Terminal states -->
    <div
      v-else-if="status === 'failed' && !error"
      class="text-center text-sm text-destructive"
    >
      {{ t("认证失败，请重试。") }}
    </div>
    <div
      v-else-if="status === 'expired'"
      class="text-center text-sm text-muted-foreground"
    >
      {{ t("会话已过期，请刷新页面重试。") }}
    </div>
  </div>
</template>
