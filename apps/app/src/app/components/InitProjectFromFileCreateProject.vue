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
import HForm from "@/app/components/headless/form/HForm.vue";

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
  <HForm
    :classes="{
      form: 'form',
    }"
  >
    <HLabel
      :classes="{
        label: 'label',
      }"
      ><span class="label-text label-text-required">{{ t("名称") }}</span>
      <HInput
        v-model="name"
        required
        type="text"
        placeholder="项目名称"
        icon="i-mdi:book"
        :classes="{
          input: 'input input-md',
          'input-container': 'input-container rounded-md',
          'input-icon': 'input-icon',
        }"
      />
    </HLabel>

    <HLabel
      :classes="{
        label: 'label',
      }"
      ><span class="label-text">{{ t("简介") }}</span
      ><Textarea v-model="description" placeholder="用于描述项目的简短文本"
    /></HLabel>

    <HLabel
      :classes="{
        label: 'label',
      }"
      required
      ><span class="label-text label-text-required">{{ t("源语言") }}</span
      ><LanguagePicker v-model="sourceLanguageId"
    /></HLabel>

    <HLabel
      :classes="{
        label: 'label',
      }"
      ><span class="label-text label-text-required">{{ t("目标语言") }}</span
      ><MultiLanguagePicker v-model:language-ids="targetLanguageIds"
    /></HLabel>

    <HLabel
      :classes="{
        label: 'label',
      }"
      ><span class="label-text label-text-required">{{ t("记忆库") }}</span>
      <MultiMemoryPicker
        v-model:memory-ids="memoryIds"
        placeholder="选择一个或多个记忆库"
    /></HLabel>

    <HLabel
      :classes="{
        label: 'label',
      }"
      ><span class="label-text label-text-required">{{ t("术语库") }}</span>
      <MultiGlossaryPicker
        v-model:glossary-ids="glossaryIds"
        create-new
        placeholder="选择一个或多个术语库"
    /></HLabel>

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
  </HForm>
</template>
