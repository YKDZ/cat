<script setup lang="ts">
import type { AuthMethod } from "@cat/shared";
import AuthOIDCBtn from "./AuthOIDCBtn.vue";

const props = defineProps<{
  method: AuthMethod;
}>();
</script>

<template>
  <AuthOIDCBtn v-if="method.providerType === 'OIDC'" :method />
</template>
