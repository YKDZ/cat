<script setup lang="ts">
import type { AuthMethod} from "@cat/shared";
import { AuthMethodType } from "@cat/shared";
import OIDCAuthButton from "./OIDCAuthButton.vue";

const props = defineProps<{
  method: AuthMethod;
}>();
</script>

<template>
  <OIDCAuthButton v-if="method.type === AuthMethodType.OIDC" :method />
</template>
