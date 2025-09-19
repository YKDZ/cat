<script setup lang="ts">
import type { Project } from "@cat/shared/schema/prisma/project";
import { ref } from "vue";
import * as z from "zod/v4";
import { useI18n } from "vue-i18n";
import { trpc } from "@cat/app-api/trpc/client";
import HButton from "@/app/components/headless/HButton.vue";
import LanguagePicker from "@/app/components/LanguagePicker.vue";
import MultiGlossaryPicker from "@/app/components/MultiGlossaryPicker.vue";
import MultiLanguagePicker from "@/app/components/MultiLanguagePicker.vue";
import MultiMemoryPicker from "@/app/components/MultiMemoryPicker.vue";
import Textarea from "@/app/components/Textarea.vue";
import { useToastStore } from "@/app/stores/toast.ts";
import HInput from "@/app/components/headless/form/HInput.vue";
import HLabel from "@/app/components/headless/form/HLabel.vue";
import HFormControl from "@/app/components/headless/form/HFormControl.vue";

const { t } = useI18n();

const { info } = useToastStore();

const progress = defineModel("progress", { type: Number, required: true });
const project = defineModel<Project>("project");

const isProcessing = ref<boolean>(false);
const name = ref<string>();
const description = ref<string>("");
const sourceLanguageId = ref<string>("");
const targetLanguageIds = ref<string[]>([]);
const memoryIds = ref<string[]>(["createNew"]);
const glossaryIds = ref<string[]>(["createNew"]);

const ProjectDataSchema = z.object({
  name: z
    .string({ error: "项目必须有名称" })
    .min(1, { error: "项目必须有名称" }),
  description: z.string({ error: "项目简介必须是字符串" }).nullable(),
  sourceLanguageId: z
    .string({ error: "必须指定项目源语言" })
    .min(1, { error: "必须指定项目源语言" }),
  targetLanguageIds: z.array(z.string()).default([]),
  memoryIds: z.array(z.ulid()).default([]),
  glossaryIds: z.array(z.ulid()).default([]),
  createMemory: z.boolean().default(true),
  createGlossary: z.boolean().default(true),
});

const createProject = async () => {
  if (isProcessing.value) return;

  const rawMemIdsAmount = memoryIds.value.length;
  const rawGloIdsAmount = glossaryIds.value.length;
  const realMemIds = memoryIds.value.filter((id) => id !== "createNew");
  const realGloIds = glossaryIds.value.filter((id) => id !== "createNew");

  const projectData = ProjectDataSchema.parse({
    name: name.value,
    description: description.value,
    sourceLanguageId: sourceLanguageId.value,
    targetLanguageIds: targetLanguageIds.value,
    memoryIds: realMemIds,
    glossaryIds: realGloIds,
    createMemory: rawMemIdsAmount - realMemIds.length === 1,
    createGlossary: rawGloIdsAmount - realGloIds.length === 1,
  });

  project.value = await trpc.project.create.mutate({
    name: projectData.name,
    description: projectData.description,
    sourceLanguageId: projectData.sourceLanguageId,
    targetLanguageIds: projectData.targetLanguageIds,
    memoryIds: projectData.memoryIds,
    glossaryIds: projectData.glossaryIds,
    createMemory: projectData.createMemory,
    createGlossary: projectData.createGlossary,
  });

  progress.value += 1;
  info("成功创建项目！");
};
</script>

<template>
  <div class="flex flex-col gap-2">
    <HFormControl
      required
      :classes="{
        container: 'form-control',
      }"
    >
      <HLabel
        :classes="{
          label: 'label',
        }"
        >{{ t("名称") }}</HLabel
      >
      <HInput
        v-model="name"
        type="text"
        placeholder="项目名称"
        icon="i-mdi:book"
        :classes="{
          input: 'input input-md',
          'input-container': 'input-container rounded-md',
          'input-icon': 'input-icon',
        }"
      />
    </HFormControl>

    <HFormControl
      :classes="{
        container: 'form-control',
      }"
    >
      <HLabel
        :classes="{
          label: 'label',
        }"
        >{{ t("简介") }}</HLabel
      >
      <Textarea v-model="description" placeholder="用于描述项目的简短文本"
    /></HFormControl>

    <HLabel
      :classes="{
        label: 'label',
      }"
      required
      >{{ t("源语言") }}</HLabel
    >
    <LanguagePicker v-model="sourceLanguageId" />

    <HLabel
      :classes="{
        label: 'label',
      }"
      >{{ t("目标语言") }}</HLabel
    >
    <MultiLanguagePicker v-model:language-ids="targetLanguageIds" />

    <HLabel
      :classes="{
        label: 'label',
      }"
      >{{ t("记忆库") }}</HLabel
    >
    <MultiMemoryPicker
      v-model:memory-ids="memoryIds"
      placeholder="选择一个或多个记忆库"
    />

    <HLabel
      :classes="{
        label: 'label',
      }"
      >{{ t("术语库") }}</HLabel
    >
    <MultiGlossaryPicker
      v-model:glossary-ids="glossaryIds"
      create-new
      placeholder="选择一个或多个术语库"
    />

    <HButton
      :classes="{
        base: 'btn btn-md btn-base',
      }"
      icon="i-mdi:plus"
      :loading="isProcessing"
      @click="createProject"
    >
      {{ t("创建项目") }}
    </HButton>
  </div>
</template>
