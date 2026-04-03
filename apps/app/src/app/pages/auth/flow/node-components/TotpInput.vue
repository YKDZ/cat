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
 * @zh TotpInput 的 props。
 * @en Props for the TotpInput node component.
 */
const props = defineProps<{
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
 * @zh 用户提交 TOTP 验证码时触发。
 * @en Emitted when user submits the TOTP code.
 */
const emit = defineEmits<{
  (e: "submit", data: Record<string, unknown>): void;
}>();


const { t } = useI18n();


const schema = toTypedSchema(
  z.object({
    token: z
      .string()
      .length(6, t("请输入 6 位验证码"))
      .regex(/^\d+$/, t("验证码只能包含数字")),
  }),
);


const { handleSubmit } = useForm({ validationSchema: schema });


const onSubmit = handleSubmit((values) => {
  emit("submit", { token: values.token });
});
</script>

<template>
  <form class="flex w-full flex-col gap-4" @submit.prevent="onSubmit">
    <div
      v-if="hint?.displayInfo?.description"
      class="text-sm text-muted-foreground"
    >
      {{ hint.displayInfo.description }}
    </div>
    <FormField name="token" v-slot="{ componentField }">
      <FormItem>
        <FormLabel>{{ t("验证码") }}</FormLabel>
        <FormControl>
          <Input
            v-bind="componentField"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            :placeholder="t('请输入 6 位验证码')"
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>
    <Button type="submit" class="w-full">{{ t("验证") }}</Button>
  </form>
</template>
