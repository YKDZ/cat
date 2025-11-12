<script setup lang="ts">
import { computed } from "vue";
import type { Document } from "@cat/shared/schema/drizzle/document";
import { useI18n } from "vue-i18n";
import { trpc } from "@cat/app-api/trpc/client";
import type { PickerOption } from "./picker/index.ts";
import Picker from "./picker/Picker.vue";
import { useToastStore } from "@/app/stores/toast.ts";
import Button from "./ui/button/Button.vue";
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogTrigger,
  DialogTitle,
} from "@/app/components/ui/dialog";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from "@/app/components/ui/form/index.ts";
import { Slider } from "@/app/components/ui/slider/index.ts";
import { toTypedSchema } from "@vee-validate/zod";
import z from "zod";
import { useForm } from "vee-validate";
import type { Language } from "@cat/shared/schema/drizzle/misc";
import DialogDescription from "@/app/components/ui/dialog/DialogDescription.vue";
import { computedAsyncClient } from "@/app/utils/vue.ts";

const props = defineProps<{
  document: Pick<Document, "id">;
  language: Pick<Language, "id">;
}>();

const { t } = useI18n();

const schema = toTypedSchema(
  z.object({
    minMemorySimilarity: z
      .array(z.number().min(0).max(1).default(0.72))
      .length(1),
    advisorId: z.int(),
  }),
);

const { handleSubmit } = useForm({
  validationSchema: schema,
  initialValues: {
    minMemorySimilarity: [0.72],
  },
});

const advisorOptions = computed<PickerOption[]>(() => {
  return availableAdvisors.value.map(
    (advisor) =>
      ({
        value: advisor.id,
        content: advisor.name,
      }) satisfies PickerOption,
  );
});

const onSubmit = handleSubmit((values) => {
  trpc.translation.autoTranslate.mutate({
    languageId: props.language.id,
    documentId: props.document.id,
    advisorId: values.advisorId,
    minMemorySimilarity: values.minMemorySimilarity[0],
  });
});

const availableAdvisors = computedAsyncClient(async () => {
  return await trpc.plugin.getAllTranslationAdvisors.query();
}, []);
</script>

<template>
  <Dialog>
    <DialogTrigger>
      <Button variant="outline" size="icon">
        <div class="icon-[mdi--translate] size-4" />
      </Button>
    </DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          {{ t("自动翻译") }}
        </DialogTitle>
        <DialogDescription>
          {{
            t(
              "系统将使用你选择的翻译建议器，以及项目绑定的术语库和记忆库，自动为文档中尚未翻译的内容填充翻译。",
            )
          }}
        </DialogDescription>
      </DialogHeader>
      <form class="space-y-4" @submit="onSubmit">
        <FormField v-slot="{ value, handleChange }" name="minMemorySimilarity">
          <FormItem>
            <FormLabel> {{ t("记忆最低匹配度") }}</FormLabel>
            <FormControl>
              <Slider
                :min="0"
                :max="1"
                :step="0.01"
                :default-value="value"
                @update:model-value="(val) => handleChange(val)"
              />
            </FormControl>
            <FormDescription class="flex justify-between">
              <span>{{ t("多高匹配度的记忆会被采用？") }}</span>
              <span>{{ value[0] }}</span>
            </FormDescription>
          </FormItem>
        </FormField>
        <FormField v-slot="{ handleChange }" name="advisorId">
          <FormItem>
            <FormLabel> {{ t("翻译建议器") }}</FormLabel>
            <FormControl>
              <Picker
                :options="advisorOptions"
                @update:model-value="handleChange"
              />
            </FormControl>
          </FormItem>
        </FormField>
        <Button type="submit">{{ t("确认") }}</Button>
      </form>
    </DialogContent>
  </Dialog>
</template>
