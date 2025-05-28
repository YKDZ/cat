<script setup lang="ts">
import AuthButton from "@/app/components/AuthButton.vue";
import AuthError from "@/app/components/AuthError.vue";
import { AuthMethod } from "@cat/shared";
import { useData } from "vike-vue/useData";
import { ref } from "vue";
import logoUrl from "../../assets/logo.png";
import { Data } from "./+data.server";

const data = useData<Data>();

const methods = ref<AuthMethod[]>(data.methods);
</script>

<template>
  <div class="flex flex-col gap-4 w-1/4 items-center">
    <img :src="logoUrl" class="w-12" />
    <h1 class="text-3xl select-none">
      登录到 <span class="font-bold">CAT</span>
    </h1>
    <AuthError class="-mt-1" />
    <div class="flex flex-col gap-1.5 w-full">
      <AuthButton v-for="method in methods" :key="method.type" :method />
    </div>
  </div>
</template>
