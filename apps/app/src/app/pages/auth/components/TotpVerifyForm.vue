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
  submit: [data: { token: string }];
}>();


const schema = toTypedSchema(
  z.object({
    token: z.string().length(6, t("请输入 6 位验证码")),
  }),
);


const { handleSubmit } = useForm({ validationSchema: schema });


const onSubmit = handleSubmit((values) => emit("submit", values));
</script>

<template>
  <form class="space-y-4" @submit.prevent="onSubmit">
    <FormField v-slot="{ componentField }" name="token">
      <FormItem>
        <FormLabel>{{ t("验证码") }}</FormLabel>
        <FormControl>
          <Input
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            :placeholder="t('输入 6 位验证码')"
            class="text-center font-mono text-lg tracking-[0.5em]"
            v-bind="componentField"
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>
    <Button type="submit" class="w-full">{{ t("验证") }}</Button>
  </form>
</template>
