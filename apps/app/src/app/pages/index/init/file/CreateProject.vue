<script setup lang="ts">
import Button from "@/app/components/Button.vue";
import Input from "@/app/components/Input.vue";
import InputLabel from "@/app/components/InputLabel.vue";
import LanguagePicker from "@/app/components/LanguagePicker.vue";
import MultiGlossaryPicker from "@/app/components/MultiGlossaryPicker.vue";
import MultiLanguagePicker from "@/app/components/MultiLanguagePicker.vue";
import MultiMemoryPicker from "@/app/components/MultiMemoryPicker.vue";
import Textarea from "@/app/components/Textarea.vue";
import { useToastStore } from "@/app/stores/toast";
import { trpc } from "@/server/trpc/client";
import type { Project } from "@cat/shared";
import { ref } from "vue";
import { z } from "zod";

const { info, zWarn, trpcWarn } = useToastStore();

const progress = defineModel("progress", { type: Number, required: true });
const project = defineModel<Project>("project");

const isProcessing = ref<boolean>(false);
const name = ref<string>();
const description = ref<string>("");
const sourceLanguageId = ref<string>("");
const targetLanguageIds = ref<string[]>([]);
const memoryIds = ref<string[]>(["createNew"]);
const glossaryIds = ref<string[]>(["createNew"]);

const ProjectFromSchema = z.object({
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

const createProject = () => {
  if (isProcessing.value) return;

  const rawMemIdsAmount = memoryIds.value.length;
  const rawGloIdsAmount = glossaryIds.value.length;
  const realMemIds = memoryIds.value.filter((id) => id !== "createNew");
  const realGloIds = glossaryIds.value.filter((id) => id !== "createNew");

  ProjectFromSchema.parseAsync({
    name: name.value,
    description: description.value,
    sourceLanguageId: sourceLanguageId.value,
    targetLanguageIds: targetLanguageIds.value,
    memoryIds: realMemIds,
    glossaryIds: realGloIds,
    createMemory: rawMemIdsAmount - realMemIds.length === 1,
    createGlossary: rawGloIdsAmount - realGloIds.length === 1,
  })
    .then(
      ({
        name,
        description,
        sourceLanguageId,
        targetLanguageIds,
        memoryIds,
        glossaryIds,
        createMemory,
        createGlossary,
      }) => {
        isProcessing.value = true;

        trpc.project.create
          .mutate({
            name,
            description,
            sourceLanguageId,
            targetLanguageIds,
            memoryIds,
            glossaryIds,
            createMemory,
            createGlossary,
          })
          .then((pro) => {
            project.value = pro;
            progress.value += 1;
            info("成功创建项目！");
          })
          .catch(trpcWarn);
      },
    )
    .catch(zWarn)
    .finally(() => (isProcessing.value = false));
};
</script>

<template>
  <!-- Create Project -->
  <div class="flex flex-col gap-2">
    <InputLabel required>名称</InputLabel>
    <Input
      v-model="name"
      type="text"
      placeholder="项目名称"
      icon="i-mdi:book"
    />
    <InputLabel>简介</InputLabel>
    <Textarea v-model="description" placeholder="用于描述项目的简短文本" />
    <InputLabel required>源语言</InputLabel>
    <LanguagePicker v-model="sourceLanguageId" />
    <InputLabel>目标语言</InputLabel>
    <MultiLanguagePicker v-model:language-ids="targetLanguageIds" />
    <InputLabel>记忆库</InputLabel>
    <MultiMemoryPicker
      v-model:memory-ids="memoryIds"
      placeholder="选择一个或多个记忆库"
    />
    <InputLabel>术语库</InputLabel>
    <MultiGlossaryPicker
      v-model:glossary-ids="glossaryIds"
      create-new
      placeholder="选择一个或多个术语库"
    />
    <Button icon="i-mdi:plus" :is-processing @click="createProject">
      创建项目
    </Button>
  </div>
</template>
