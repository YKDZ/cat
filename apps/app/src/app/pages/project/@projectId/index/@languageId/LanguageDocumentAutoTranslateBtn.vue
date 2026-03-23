<script setup lang="ts">
import type { Document } from "@cat/shared/schema/drizzle/document";
import type { Language } from "@cat/shared/schema/drizzle/misc";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  Slider,
  Switch,
} from "@cat/ui";
import { useQuery } from "@pinia/colada";
import { toTypedSchema } from "@vee-validate/zod";
import { useForm } from "vee-validate";
import { usePageContext } from "vike-vue/usePageContext";
import { navigate } from "vike/client/router";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import * as z from "zod";

import type { PickerOption } from "@/app/components/picker";

import Picker from "@/app/components/picker/Picker.vue";
import { orpc } from "@/app/rpc/orpc";

const props = defineProps<{
  document: Pick<Document, "id">;
  language: Pick<Language, "id">;
}>();


const { t } = useI18n();
const ctx = usePageContext();


const schema = toTypedSchema(
  z.object({
    minMemorySimilarity: z
      .array(z.number().min(0).max(1).default(0.72))
      .length(1),
    advisorId: z.int().optional(),
    enableLlmRefine: z.boolean().default(false),
    llmProviderId: z.number().int().optional(),
    gatherDocumentContext: z.boolean().default(false),
  }),
);


const { handleSubmit, values } = useForm({
  validationSchema: schema,
  initialValues: {
    minMemorySimilarity: [0.72],
    enableLlmRefine: false,
    gatherDocumentContext: false,
  },
});


const advisorOptions = computed<PickerOption<number>[]>(() => {
  if (!advisorState.value || !advisorState.value.data) return [];
  return advisorState.value.data.map(
    (advisor) =>
      ({
        value: advisor.id,
        content: advisor.name,
      }) satisfies PickerOption,
  );
});


const llmProviderOptions = computed<PickerOption<number>[]>(() => {
  if (!llmState.value || !llmState.value.data) return [];
  return llmState.value.data.map(
    (provider) =>
      ({
        value: provider.id,
        content: provider.name,
      }) satisfies PickerOption,
  );
});


const onSubmit = handleSubmit(async (formValues) => {
  const { runId } = await orpc.translation.autoTranslate({
    languageId: props.language.id,
    documentId: props.document.id,
    advisorId: formValues.advisorId,
    minMemorySimilarity: formValues.minMemorySimilarity[0],
    config: {
      llm: {
        enabled: formValues.enableLlmRefine,
        llmProviderId: formValues.llmProviderId,
      },
      gatherDocumentContext: formValues.gatherDocumentContext,
    },
  });
  const projectId = ctx.routeParams?.projectId;
  await navigate(`/project/${projectId}/workflows/${runId}`);
});


const { state: advisorState } = useQuery({
  key: ["availableAdvisors"],
  query: () => orpc.plugin.getAllTranslationAdvisors(),
  enabled: !import.meta.env.SSR,
});


const { state: llmState } = useQuery({
  key: ["availableLLMProviders"],
  query: () => orpc.agent.listLLMProviders(),
  enabled: !import.meta.env.SSR,
});
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
                @update:model-value="(val: number[]) => handleChange(val)"
              />
            </FormControl>
            <FormDescription class="flex justify-between">
              <span>{{ t("多高匹配度的记忆会被采用？") }}</span>
              <span>{{ value[0] }}</span>
            </FormDescription>
          </FormItem>
        </FormField>
        <FormField v-slot="{ setValue }" name="advisorId">
          <FormItem>
            <FormLabel> {{ t("翻译建议器") }}</FormLabel>
            <FormControl>
              <Picker
                :placeholder="t('选择一个建议器...')"
                :options="advisorOptions"
                @update:model-value="(v) => setValue(v)"
              />
            </FormControl>
          </FormItem>
        </FormField>
        <FormField v-slot="{ value, handleChange }" name="enableLlmRefine">
          <FormItem
            class="flex flex-row items-center justify-between rounded-lg border p-3"
          >
            <div class="space-y-0.5">
              <FormLabel>{{ t("启用 LLM 精修") }}</FormLabel>
              <FormDescription>{{
                t("使用 LLM 对翻译结果进行术语一致性和风格精修")
              }}</FormDescription>
            </div>
            <FormControl>
              <Switch :checked="value" @update:checked="handleChange" />
            </FormControl>
          </FormItem>
        </FormField>
        <FormField
          v-if="values.enableLlmRefine"
          v-slot="{ setValue }"
          name="llmProviderId"
        >
          <FormItem>
            <FormLabel>{{ t("LLM Provider") }}</FormLabel>
            <FormControl>
              <Picker
                :placeholder="t('选择 LLM Provider...')"
                :options="llmProviderOptions"
                @update:model-value="(v) => setValue(v)"
              />
            </FormControl>
          </FormItem>
        </FormField>
        <FormField
          v-slot="{ value, handleChange }"
          name="gatherDocumentContext"
        >
          <FormItem
            class="flex flex-row items-center justify-between rounded-lg border p-3"
          >
            <div class="space-y-0.5">
              <FormLabel>{{ t("收集文档上下文") }}</FormLabel>
              <FormDescription>{{
                t("收集相邻已有翻译作为 LLM 精修上下文，提升译文连贯性")
              }}</FormDescription>
            </div>
            <FormControl>
              <Switch :checked="value" @update:checked="handleChange" />
            </FormControl>
          </FormItem>
        </FormField>
        <Button type="submit">{{ t("确认") }}</Button>
      </form>
    </DialogContent>
  </Dialog>
</template>
