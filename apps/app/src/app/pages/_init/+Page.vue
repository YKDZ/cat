<script setup lang="ts">
import Button from "@/app/components/Button.vue";
import Input from "@/app/components/Input.vue";
import InputLabel from "@/app/components/InputLabel.vue";
import Logo from "@/app/components/Logo.vue";
import MultiLanguagePicker from "@/app/components/MultiLanguagePicker.vue";
import { useToastStore } from "@/app/stores/toast";
import { trpc } from "@/server/trpc/client";
import { usePageContext } from "vike-vue/usePageContext";
import { ref } from "vue";

const { user } = usePageContext();

const { info, trpcWarn } = useToastStore();

const name = ref<string>(user!.name);
const email = ref<string>(user!.email);
const readableLanguageIds = ref<string[]>([]);
const writableLanguageIds = ref<string[]>([]);
const isProcessing = ref<boolean>(false);

const handleInit = () => {
  if (isProcessing.value) return;

  isProcessing.value = true;

  trpc.user.init
    .mutate({
      name: name.value,
      email: email.value,
      writableLanguageIds: writableLanguageIds.value,
      readableLanguageIds: readableLanguageIds.value,
    })
    .then(() => {
      info("设置成功");
      info("即将前往首页");
    })
    .catch(trpcWarn)
    .finally(() => (isProcessing.value = false));
};
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-col w-full items-center">
      <h3 class="text-2xl inline-flex text-nowrap items-center">
        看起来你是第一次来到 <Logo />
      </h3>
      <p>让我们完成一些基本设置...</p>
    </div>
    <div class="flex flex-col gap-1">
      <div>
        <InputLabel :required="!user!.name">用户名</InputLabel>
        <Input v-model="name" type="text" full-width />
      </div>
      <div>
        <InputLabel :required="!user!.email">邮箱地址</InputLabel>
        <Input v-model="email" type="email" full-width />
      </div>
      <div>
        <InputLabel>可读语言</InputLabel>
        <MultiLanguagePicker full-width :language-ids="readableLanguageIds" />
      </div>
      <div>
        <InputLabel>可写语言</InputLabel>
        <MultiLanguagePicker full-width :language-ids="writableLanguageIds" />
      </div>
    </div>
    <div>
      <Button :is-processing full-width @click="handleInit">进入 CAT</Button>
    </div>
  </div>
</template>
