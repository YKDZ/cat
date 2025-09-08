<script setup lang="ts">
import HButton from "@/app/components/headless/HButton.vue";
import { ref } from "vue";

const isLoading = ref(false);
const isDisabled = ref(false);

const handleClick = () => {
  console.log("Button clicked!");
  window.alert("clicked");
};

const toggleLoading = () => {
  isLoading.value = !isLoading.value;
};

const toggleDisabled = () => {
  isDisabled.value = !isDisabled.value;
};
</script>

<template>
  <div class="p-8 space-y-4">
    <h1 class="text-2xl font-bold mb-6">HButton 组件测试</h1>

    <!-- 控制按钮 -->
    <div class="flex gap-4 mb-8">
      <button
        @click="toggleLoading"
        class="px-4 py-2 bg-blue-500 text-white rounded"
      >
        {{ isLoading ? "停止加载" : "开始加载" }}
      </button>
      <button
        @click="toggleDisabled"
        class="px-4 py-2 bg-gray-500 text-white rounded"
      >
        {{ isDisabled ? "启用按钮" : "禁用按钮" }}
      </button>
    </div>

    <!-- 基础用法 -->
    <div class="space-y-4">
      <h2 class="text-lg font-semibold">基础用法</h2>
      <HButton
        :classes="{
          base: 'btn btn-lg btn-base',
          'base-disabled': 'btn btn-lg btn-disabled',
          loading: 'animate-spin mr-2',
        }"
        :loading="isLoading"
        :disabled="isDisabled"
        @click="handleClick"
      >
        保存
        <template #loading> <div class="i-mdi:dots-circle" /> </template>
      </HButton>
    </div>

    <!-- 自定义加载内容 -->
    <div class="space-y-4">
      <h2 class="text-lg font-semibold">自定义加载内容</h2>
      <HButton
        :classes="{
          base: 'bg-purple-500 text-white px-6 py-3 rounded-lg',
          loading: 'mr-2',
        }"
        :loading="isLoading"
        :disabled="isDisabled"
        @click="handleClick"
      >
        <template #loading>
          <span class="inline-block animate-pulse">⏳</span>
        </template>
        提交表单
      </HButton>
    </div>
  </div>
</template>
