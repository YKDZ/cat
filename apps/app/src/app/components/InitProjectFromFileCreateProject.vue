<script setup lang="ts">
import type { Project } from "@cat/shared/schema/drizzle/project";
import * as z from "zod/v4";
import { useI18n } from "vue-i18n";
import { trpc } from "@cat/app-api/trpc/client";
import MultiLanguagePicker from "@/app/components/MultiLanguagePicker.vue";
import { Textarea } from "@/app/components/ui/textarea";
import { useToastStore } from "@/app/stores/toast.ts";
import { Button } from "@/app/components/ui/button";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form";
import { Input } from "@/app/components/ui/input";
import { useForm } from "vee-validate";
import { toTypedSchema } from "@vee-validate/zod";
import MultiMemoryPicker from "@/app/components/MultiMemoryPicker.vue";
import MultiGlossaryPicker from "@/app/components/MultiGlossaryPicker.vue";
import { Switch } from "@/app/components/ui/switch";

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
    memoryIds: z.array(z.uuidv7()),
    glossaryIds: z.array(z.uuidv7()),
    createMemory: z.boolean(),
    createGlossary: z.boolean(),
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
  const createMemory = values.memoryIds.includes("createNew");
  const createGlossary = values.glossaryIds.includes("createNew");

  project.value = await trpc.project.create.mutate({
    name: values.name,
    description: values.description,
    targetLanguageIds: values.targetLanguageIds,
    memoryIds: values.memoryIds,
    glossaryIds: values.glossaryIds,
    createMemory,
    createGlossary,
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
    <FormField v-slot="{ componentField }" name="targetLanguageIds">
      <FormItem>
        <FormLabel>{{ t("目标语言") }}</FormLabel
        ><FormControl>
          <MultiLanguagePicker v-bind="componentField" /> </FormControl
        ><FormMessage />
      </FormItem>
    </FormField>
    <FormField v-slot="{ componentField }" name="memoryIds">
      <FormItem>
        <FormLabel>{{ t("记忆库") }}</FormLabel
        ><FormControl>
          <MultiMemoryPicker v-bind="componentField" /> </FormControl
        ><FormMessage />
      </FormItem>
    </FormField>
    <FormField v-slot="{ componentField }" name="createMemory">
      <FormItem>
        <FormControl>
          <div class="flex items-center space-x-2">
            <Label for="createMemory">{{ t("创建同名记忆库") }}</Label>
            <Switch id="createMemory" v-bind="componentField" />
          </div> </FormControl
        ><FormMessage />
      </FormItem>
    </FormField>
    <FormField v-slot="{ componentField }" name="glossaryIds">
      <FormItem>
        <FormLabel>{{ t("术语库") }}</FormLabel
        ><FormControl>
          <MultiGlossaryPicker v-bind="componentField" /> </FormControl
        ><FormMessage />
      </FormItem>
    </FormField>
    <FormField v-slot="{ componentField }" name="createGlossary">
      <FormItem>
        <FormControl>
          <div class="flex items-center space-x-2">
            <Label for="createGlossary">{{ t("创建同名术语库") }}</Label>
            <Switch id="createGlossary" v-bind="componentField" />
          </div>
        </FormControl>
      </FormItem>
    </FormField>
    <Button type="submit">
      {{ t("创建项目") }}
    </Button>
  </form>
</template>
