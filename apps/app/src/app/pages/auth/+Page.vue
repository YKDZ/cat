<script setup lang="ts">
import { useData } from "vike-vue/useData";
import { usePageContext } from "vike-vue/usePageContext";
import type { Data } from "./+data.ts";
import AuthError from "@/app/components/AuthError.vue";
import logoUrl from "@/app/assets/logo.png";
import AuthPreHandler from "@/app/components/AuthPreHandler.vue";

const ctx = usePageContext();

const { methods } = useData<Data>();
</script>

<template>
  <div class="px-10 flex flex-col gap-4 w-full items-center md:px-0 md:w-1/3">
    <img :src="logoUrl" class="w-12" />
    <h1 class="text-3xl select-none">
      登录到 <span class="font-bold">{{ ctx.globalContext.name }}</span>
    </h1>
    <AuthError class="-mt-1" />
    <div class="flex flex-col gap-1.5 w-full">
      <AuthPreHandler
        v-for="method in methods"
        :key="method.providerId"
        :method
      />
    </div>
  </div>
</template>
