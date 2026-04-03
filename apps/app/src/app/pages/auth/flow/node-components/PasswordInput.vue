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
 * @zh PasswordInput 的 props。
 * @en Props for the PasswordInput node component.
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
 * @zh 用户提交密码时触发。
 * @en Emitted when user submits the password.
 */
const emit = defineEmits<{
  (e: "submit", data: Record<string, unknown>): void;
}>();


const { t } = useI18n();


const schema = toTypedSchema(
  z.object({
    password: z.string().min(1, t("请输入密码")),
  }),
);


const { handleSubmit } = useForm({ validationSchema: schema });


const onSubmit = handleSubmit((values) => {
  emit("submit", { password: values.password });
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
    <FormField name="password" v-slot="{ componentField }">
      <FormItem>
        <FormLabel>{{ t("密码") }}</FormLabel>
        <FormControl>
          <Input
            v-bind="componentField"
            type="password"
            autocomplete="current-password"
            :placeholder="t('请输入密码')"
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>
    <Button type="submit" class="w-full">{{ t("验证") }}</Button>
  </form>
</template>
