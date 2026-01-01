<script setup lang="ts">
import AuthMFAHandler from "./MfaHandler.vue";
import AuthMFAPreHandler from "./MfaPreHandler.vue";
import { useAuthStore } from "@/app/stores/auth";
import { orpc } from "@/server/orpc";
import { storeToRefs } from "pinia";
import { navigate } from "vike/client/router";
import { ref } from "vue";

const { userId } = storeToRefs(useAuthStore());
const isPre = ref(true);

const mfaProviders = ref([
  {
    id: 0,
  },
]);

const handleComplete = async () => {
  await orpc.auth.completeAuthWithMFA();
  await navigate("/");
};
</script>

<template>
  <div v-if="userId && isPre" class="flex flex-col w-full gap-2">
    <AuthMFAPreHandler
      v-for="provider in mfaProviders"
      @pre-mfa="isPre = false"
      :key="provider.id"
      :method="{
        providerId: provider.id,
        name: 'MFA',
      }"
    />
  </div>
  <div v-if="userId && !isPre" class="flex flex-col w-full gap-2">
    <AuthMFAHandler
      v-for="provider in mfaProviders"
      @mfa="handleComplete"
      :key="provider.id"
      :mfaProviderId="provider.id"
      :userId
    />
  </div>
</template>
