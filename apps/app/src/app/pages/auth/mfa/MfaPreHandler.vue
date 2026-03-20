<script setup lang="ts">
import { Button } from "@cat/ui";
import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";

import { orpc } from "@/app/rpc/orpc";
import { useAuthStore } from "@/app/stores/auth.ts";

const { t } = useI18n();


const props = defineProps<{
  method: {
    providerId: number;
    name: string;
  };
}>();


const emits = defineEmits<{
  preMFA: [];
}>();


const { userId } = storeToRefs(useAuthStore());


const handlePreMfa = async () => {
  if (!userId.value) return;


  await orpc.auth.preMfa({
    userId: userId.value,
    mfaProviderId: props.method.providerId,
  });
};
</script>

<template>
  <Button :data-testid="method.providerId" @click="handlePreMfa">
    <div class="icon-[mdi--cog] size-4" />
    {{ t("通过 {name} 验证", { name: method.name }) }}
  </Button>
</template>
