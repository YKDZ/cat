<script setup lang="ts">
import { Button, Input } from "@cat/ui";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@cat/ui";
import { toTypedSchema } from "@vee-validate/zod";
import { useForm } from "vee-validate";
import { useI18n } from "vue-i18n";
import * as z from "zod";

const { t } = useI18n();

const emit = defineEmits<{
  submit: [data: { password: string }];
}>();

const schema = toTypedSchema(
  z.object({
    password: z.string().min(1, t("请输入密码")),
  }),
);

const { handleSubmit } = useForm({ validationSchema: schema });

const onSubmit = handleSubmit((values) => emit("submit", values));
</script>

<template>
  <form class="space-y-4" @submit.prevent="onSubmit">
    <FormField v-slot="{ componentField }" name="password">
      <FormItem>
        <FormLabel>{{ t("密码") }}</FormLabel>
        <FormControl>
          <Input
            type="password"
            autocomplete="current-password"
            :placeholder="t('输入你的密码')"
            v-bind="componentField"
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>
    <Button type="submit" class="w-full">{{ t("登录") }}</Button>
  </form>
</template>
