<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useAuthStore } from "../stores/auth";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const { isError, authMethod } = storeToRefs(useAuthStore());
</script>

<template>
  <div v-if="isError" class="text-error-content px-3 py-2 rounded-md bg-error">
    <div v-if="authMethod" class="flex flex-col items-center">
      <p>{{ t("当前无法通过 {name} 登录", { name: authMethod.name }) }}</p>
      <p>{{ t("请稍后再试或选择其他登录方式") }}</p>
    </div>
    <div v-else class="flex flex-col items-center">
      <p>{{ t("登录错误") }}</p>
      <p>{{ t("请稍后再试或联系管理员") }}</p>
    </div>
  </div>
</template>
