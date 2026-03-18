<script setup lang="ts">
import { Input } from "@cat/ui";
import { FormField, FormLabel, FormControl } from "@cat/ui";
import { storeToRefs } from "pinia";
import { useData } from "vike-vue/useData";
import { usePageContext } from "vike-vue/usePageContext";
import { useI18n } from "vue-i18n";

import logoUrl from "@/app/assets/logo.png";
import { useAuthStore } from "@/app/stores/auth.ts";

import type { Data } from "./+data.server.ts";

import AuthError from "./AuthError.vue";
import AuthPreHandler from "./AuthPreHandler.vue";

const ctx = usePageContext();


const { t } = useI18n();


const { methods } = useData<Data>();


const { identifier } = storeToRefs(useAuthStore());
</script>

<template>
  <div class="flex w-full flex-col items-center gap-4 px-10 md:w-1/3 md:px-0">
    <img :src="logoUrl" class="w-12" />
    <h1 class="text-3xl select-none">
      登录到 <span class="font-bold">{{ ctx.globalContext.name }}</span>
    </h1>
    <AuthError class="-mt-1" />

    <form>
      <FormField name="identifier">
        <FormLabel>{{ t("邮箱") }}</FormLabel>
        <FormControl>
          <Input v-model="identifier" type="email" autocomplete="email" />
        </FormControl>
      </FormField>
    </form>

    <div class="flex w-full flex-col gap-1.5">
      <AuthPreHandler
        v-for="method in methods"
        :key="method.providerId"
        :identifier
        :method
      />
    </div>
  </div>
</template>
