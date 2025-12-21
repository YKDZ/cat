<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";
import { trpc } from "@cat/app-api/trpc/client";
import { useAuthStore } from "@/app/stores/auth.ts";
import { Button } from "@/app/components/ui/button";

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

  await trpc.auth.preMFA.mutate({
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
