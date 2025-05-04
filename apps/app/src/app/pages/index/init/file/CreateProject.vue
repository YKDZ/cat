<script setup lang="ts">
import Button from "@/app/components/Button.vue";
import Input from "@/app/components/Input.vue";
import InputLabel from "@/app/components/InputLabel.vue";
import LanguagePicker from "@/app/components/LanguagePicker.vue";
import Textarea from "@/app/components/Textarea.vue";
import { useToastStore } from "@/app/stores/toast";
import { trpc } from "@/server/trpc/client";
import { Project } from "@cat/shared";
import { ref } from "vue";
import { z } from "zod";

const { info, warn, zWarn, trpcWarn, error } = useToastStore();

const progress = defineModel("progress", { type: Number, required: true });
const project = defineModel<Project>("project");

const isProcessing = ref<boolean>(false);
const name = ref<string>();
const description = ref<string>("");
const languageId = ref<string>("");

const ProjectFromSchema = z.object({
  name: z
    .string({ message: "项目必须有名称" })
    .min(1, { message: "项目必须有名称" }),
  description: z.string({ message: "项目简介必须是字符串" }).optional(),
  languageId: z
    .string({ message: "必须指定项目源语言" })
    .min(1, { message: "必须指定项目源语言" }),
});

const createProject = () => {
  if (isProcessing.value) return;

  ProjectFromSchema.parseAsync({
    name: name.value,
    description: description.value,
    languageId: languageId.value,
  })
    .then(({ name, description, languageId }) => {
      isProcessing.value = true;

      trpc.project.create
        .mutate({
          name,
          description,
          languageId,
        })
        .then((pro) => {
          project.value = pro;
          progress.value += 1;
          info("成功创建项目！");
        })
        .catch(trpcWarn);
    })
    .catch(zWarn)
    .finally(() => (isProcessing.value = false));
};
</script>

<template>
  <!-- Create Project -->
  <div class="flex flex-col gap-2">
    <InputLabel>项目名称</InputLabel>
    <Input
      v-model="name"
      type="text"
      placeholder="项目名称"
      icon="i-mdi:book"
    />
    <InputLabel>项目简介</InputLabel>
    <Textarea v-model="description" placeholder="用于描述项目的简短文本" />
    <InputLabel>项目源语言</InputLabel>
    <LanguagePicker v-model:language-id="languageId" />
    <Button icon="i-mdi:plus" :is-processing @click="createProject"
      >创建项目</Button
    >
  </div>
</template>
