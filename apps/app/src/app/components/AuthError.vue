<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useAuthStore } from "../stores/auth";

const { isError, authMethod } = storeToRefs(useAuthStore());
</script>

<template>
  <div v-if="isError" class="px-3 py-2 rounded-md bg-red-200">
    <div v-if="authMethod" class="flex flex-col items-center">
      <p>当前无法通过 {{ authMethod.name }} 登录</p>
      <p>请稍后再试或选择其他登录方式</p>
    </div>
    <div v-else class="flex flex-col items-center">
      <p>登录错误</p>
      <p>请稍后再试或联系管理员</p>
    </div>
  </div>
</template>
