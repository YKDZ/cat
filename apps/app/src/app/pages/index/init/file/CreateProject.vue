<script setup lang="ts">
import type { Project } from "@cat/shared/schema/drizzle/project";

import { Textarea } from "@cat/ui";
import { Button } from "@cat/ui";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@cat/ui";
import { Input } from "@cat/ui";
import { Switch } from "@cat/ui";
import { Label } from "@cat/ui";
import { toTypedSchema } from "@vee-validate/zod";
import { useForm } from "vee-validate";
import { useI18n } from "vue-i18n";
import * as z from "zod/v4";

import MultiGlossaryPicker from "@/app/components/MultiGlossaryPicker.vue";
import MultiLanguagePicker from "@/app/components/MultiLanguagePicker.vue";
import MultiMemoryPicker from "@/app/components/MultiMemoryPicker.vue";
import { useToastStore } from "@/app/stores/toast.ts";
import { orpc } from "@/server/orpc";

const { t } = useI18n();
const { info } = useToastStore();


const progress = defineModel("progress", { type: Number, required: true });
const project = defineModel<Project>("project");


const schema = toTypedSchema(
  z.object({
    name: z
      .string({ error: "项目必须有名称" })
      .min(1, { error: "项目必须有名称" }),
    description: z.string({ error: "项目简介必须是字符串" }),
    targetLanguageIds: z.array(z.string()),
    memoryIds: z.array(z.uuidv4()),
    glossaryIds: z.array(z.uuidv4()),
    createMemory: z.boolean({ error: "必须是布尔值" }),
    createGlossary: z.boolean({ error: "必须是布尔值" }),
  }),
);


const { handleSubmit } = useForm({
  validationSchema: schema,
  initialValues: {
    name: "",
    description: "",
    targetLanguageIds: [],
    memoryIds: [],
    glossaryIds: [],
    createMemory: true,
    createGlossary: true,
  },
});


const onSubmit = handleSubmit(async (values) => {
  project.value = await orpc.project.create({
    ...values,
  });

  progress.value += 1;
  info("成功创建项目！");
});
</script>

<template>
  <form class="space-y-4" @submit="onSubmit">
    <FormField v-slot="{ componentField }" name="name">
      <FormItem>
        <FormLabel>{{ t("名称") }}</FormLabel
        ><FormControl>
          <Input
            type="text"
            :placeholder="t('项目名称')"
            v-bind="componentField"
          /> </FormControl
        ><FormMessage />
      </FormItem> </FormField
    ><FormField v-slot="{ componentField }" name="description">
      <FormItem>
        <FormLabel>{{ t("简介") }}</FormLabel
        ><FormControl>
          <Textarea
            :placeholder="t('项目简介')"
            v-bind="componentField"
          /> </FormControl
        ><FormMessage />
      </FormItem>
    </FormField>
    <FormField v-slot="{ value, handleChange }" name="targetLanguageIds">
      <FormItem>
        <FormLabel>{{ t("目标语言") }}</FormLabel
        ><FormControl>
          <MultiLanguagePicker
            data-testid="create-project-multi-language-picker"
            :model-value="value"
            @update:model-value="handleChange"
          /> </FormControl
        ><FormMessage />
      </FormItem>
    </FormField>
    <FormField v-slot="{ value, handleChange }" name="memoryIds">
      <FormItem>
        <FormLabel>{{ t("记忆库") }}</FormLabel
        ><FormControl>
          <MultiMemoryPicker
            :model-value="value"
            @update:model-value="handleChange"
          /> </FormControl
        ><FormMessage />
      </FormItem>
    </FormField>
    <FormField v-slot="{ value, handleChange }" name="createMemory">
      <FormItem>
        <FormControl>
          <div class="flex items-center space-x-2">
            <Label for="createMemory">{{ t("创建同名记忆库") }}</Label>
            <Switch
              id="createMemory"
              :model-value="value"
              @update:model-value="handleChange"
            />
          </div> </FormControl
        ><FormMessage />
      </FormItem>
    </FormField>
    <FormField v-slot="{ value, handleChange }" name="glossaryIds">
      <FormItem>
        <FormLabel>{{ t("术语库") }}</FormLabel
        ><FormControl>
          <MultiGlossaryPicker
            :model-value="value"
            @update:model-value="handleChange"
          /> </FormControl
        ><FormMessage />
      </FormItem>
    </FormField>
    <FormField v-slot="{ value, handleChange }" name="createGlossary">
      <FormItem>
        <FormControl>
          <div class="flex items-center space-x-2">
            <Label for="createGlossary">{{ t("创建同名术语库") }}</Label>
            <Switch
              id="createGlossary"
              :model-value="value"
              @update:model-value="handleChange"
            />
          </div>
        </FormControl>
      </FormItem>
    </FormField>
    <Button type="submit">
      {{ t("创建项目") }}
    </Button>
  </form>
</template>
