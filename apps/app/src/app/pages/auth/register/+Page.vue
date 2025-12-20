<script setup lang="ts">
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { useAuthStore } from "@/app/stores/auth";
import { useToastStore } from "@/app/stores/toast";
import { trpc } from "@cat/app-api/trpc/client";
import { toTypedSchema } from "@vee-validate/zod";
import { storeToRefs } from "pinia";
import { useForm } from "vee-validate";
import { navigate } from "vike/client/router";
import { onMounted } from "vue";
import { useI18n } from "vue-i18n";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form";
import * as z from "zod";

const { t } = useI18n();
const { info } = useToastStore();

const { identifier } = storeToRefs(useAuthStore());

const schema = toTypedSchema(
  z.object({
    email: z.email({ error: t("邮箱格式有误") }),
    name: z
      .string({ error: t("必须指定一个用户名") })
      .min(1, { error: t("用户名至少 1 个字符") }),
    password: z.string().min(7, t("密码长度至少 7 位")),
  }),
);

const { handleSubmit } = useForm({
  validationSchema: schema,
  initialValues: {
    email: identifier.value,
  },
});

const onSubmit = handleSubmit(async (values) => {
  await trpc.auth.register.mutate({
    ...values,
  });

  info(t("注册成功"));

  await navigate("/");
});

onMounted(() => {
  info(
    t("{identifier} 对应的账号不存在，请注册", {
      identifier: identifier.value,
    }),
  );
});
</script>

<template>
  <form class="space-y-4" @submit="onSubmit">
    <FormField v-slot="{ componentField }" name="email">
      <FormItem>
        <FormLabel>{{ t("邮箱") }}</FormLabel
        ><FormControl>
          <Input
            type="email"
            autocomplete="email"
            :placeholder="t('你的电子邮箱地址')"
            v-bind="componentField"
          /> </FormControl
        ><FormMessage />
      </FormItem>
    </FormField>
    <FormField v-slot="{ componentField }" name="name">
      <FormItem>
        <FormLabel>{{ t("用户名") }}</FormLabel
        ><FormControl>
          <Input
            type="text"
            autocomplete="nickname"
            :placeholder="t('你的显示名称')"
            v-bind="componentField"
          /> </FormControl
        ><FormMessage />
      </FormItem>
    </FormField>
    <FormField v-slot="{ componentField }" name="password">
      <FormItem>
        <FormLabel>{{ t("密码") }}</FormLabel
        ><FormControl>
          <Input
            type="password"
            autocomplete="new-password"
            :placeholder="t('安全的密码')"
            v-bind="componentField"
          /> </FormControl
        ><FormMessage />
      </FormItem>
    </FormField>
    <Button class="w-full" type="submit">
      {{ t("注册") }}
    </Button>
  </form>
</template>
