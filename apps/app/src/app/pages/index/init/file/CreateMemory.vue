<script setup lang="ts">
import Button from "@/app/components/Button.vue";
import Input from "@/app/components/Input.vue";
import InputLabel from "@/app/components/InputLabel.vue";
import Textarea from "@/app/components/Textarea.vue";
import { useToastStore } from "@/app/stores/toast";
import { trpc } from "@/server/trpc/client";
import { Project } from "@cat/shared";
import { ref } from "vue";
import { z } from "zod";

const { info, warn, zWarn, trpcWarn, error } = useToastStore();

const progress = defineModel("progress", { type: Number, required: true });
const project = defineModel<Project>("project", { required: true });

const isProcessing = ref<boolean>(false);
const name = ref<string>();
const description = ref<string>("");

const ProjectFromSchema = z.object({
  name: z
    .string({ message: "项目必须有名称" })
    .min(1, { message: "项目必须有名称" }),
  description: z.string({ message: "项目简介必须是字符串" }).optional(),
  projectId: z.string({ message: "必须指定要绑定到的项目 ID" }).cuid2(),
});

const createMemory = () => {
  if (isProcessing.value) return;

  ProjectFromSchema.parseAsync({
    name: name.value,
    description: description.value,
    projectId: project.value.id,
  })
    .then(({ name, description, projectId }) => {
      isProcessing.value = true;

      trpc.memory.create
        .mutate({
          name,
          description,
          projectId,
        })
        .then(() => {
          progress.value += 1;
          info("成功创建记忆库！");
        })
        .catch(trpcWarn);
    })
    .catch(zWarn)
    .finally(() => (isProcessing.value = false));
};
</script>

<template>
  <!-- Create Memory -->
  <div class="flex flex-col gap-2">
    <InputLabel>记忆库名称</InputLabel>
    <Input
      v-model="name"
      type="text"
      placeholder="记忆库名称"
      icon="i-mdi:book"
    />
    <InputLabel>项目简介</InputLabel>
    <Textarea
      v-model="description"
      placeholder="用于描述记忆库内容的简短文本"
    />
    <Button icon="i-mdi:plus" :is-processing @click="createMemory"
      >创建记忆库并连接到项目</Button
    >
    <Button icon="i-mdi:chevron-right" @click="progress += 1"
      >不创建记忆库</Button
    >
  </div>
</template>
