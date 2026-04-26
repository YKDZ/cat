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
 * @zh IdentifierInput 的 props。
 * @en Props for the IdentifierInput node component.
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
 * @zh 用户提交标识符（邮箱或用户名）时触发。
 * @en Emitted when user submits the identifier.
 */
const emit = defineEmits<{
  (e: "submit", data: Record<string, unknown>): void;
}>();

const { t } = useI18n();

const schema = toTypedSchema(
  z.object({
    identifier: z.string().min(1, t("请输入邮箱")),
  }),
);

const { handleSubmit } = useForm({ validationSchema: schema });

const onSubmit = handleSubmit((values) => {
  emit("submit", { identifier: values.identifier });
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
    <FormField name="identifier" v-slot="{ componentField }">
      <FormItem>
        <FormLabel>{{ t("邮箱") }}</FormLabel>
        <FormControl>
          <Input
            v-bind="componentField"
            type="email"
            autocomplete="email"
            :placeholder="t('请输入邮箱地址')"
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>
    <Button type="submit" class="w-full">{{ t("继续") }}</Button>
  </form>
</template>
