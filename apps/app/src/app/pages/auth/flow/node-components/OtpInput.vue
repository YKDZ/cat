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

/**
 * @zh OtpInput 的 props（预留）。
 * @en Props for the OtpInput node component (reserved for future use).
 */
defineProps<{
  /**
   * @zh 来自认证流节点的客户端提示信息。
   * @en Client hint from the auth flow node.
   */
  hint?: {
    displayInfo?: {
      title?: string;
      description?: string;
    };
  };
}>();

/**
 * @zh 用户提交 OTP 验证码时触发。
 * @en Emitted when user submits the OTP code.
 */
const emit = defineEmits<{
  (e: "submit", data: Record<string, unknown>): void;
}>();

const { t } = useI18n();

const schema = toTypedSchema(
  z.object({
    otp: z.string().min(4, t("请输入验证码")).max(8),
  }),
);

const { handleSubmit } = useForm({ validationSchema: schema });

const onSubmit = handleSubmit((values) => {
  emit("submit", { otp: values.otp });
});
</script>

<template>
  <form class="flex w-full flex-col gap-4" @submit.prevent="onSubmit">
    <FormField name="otp" v-slot="{ componentField }">
      <FormItem>
        <FormLabel>{{ t("短信验证码") }}</FormLabel>
        <FormControl>
          <Input
            v-bind="componentField"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            :placeholder="t('请输入验证码')"
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>
    <Button type="submit" class="w-full">{{ t("验证") }}</Button>
  </form>
</template>
