<script setup lang="ts">
import { navigate } from "vike/client/router";
import { inject, ref } from "vue";
import { useI18n } from "vue-i18n";
import { trpc } from "@cat/app-api/trpc/client";
import type { Data } from "../+data.server.ts";
import HButton from "@/app/components/headless/HButton.vue";
import InputLabel from "@/app/components/InputLabel.vue";
import HInput from "@/app/components/headless/form/HInput.vue";
import { useInjectionKey } from "@/app/utils/provide.ts";

const { t } = useI18n();
const project = inject(useInjectionKey<Data>()("project"))!;
const name = ref(project.name);

const updateName = async (): Promise<void> => {
  if (!project) return;
  update(project.id, { name: name.value });
};

const update = async (
  id: string,
  {
    name,
    targetLanguageIds,
  }: {
    name?: string;
    targetLanguageIds?: string[];
  } = {},
): Promise<void> => {
  if (!project) return;

  await trpc.project.update.mutate({
    id,
    name,

    targetLanguageIds,
  });
};

const remove = async (): Promise<void> => {
  if (!project) return;

  await trpc.project.delete.mutate({ id: project.id });

  await navigate("/projects");
};
</script>

<template>
  <h1>{{ t("通用") }}</h1>
  <h2>{{ t("项目信息") }}</h2>
  <div>
    <InputLabel>{{ t("项目名称") }}</InputLabel>
    <div class="flex gap-1 items-center">
      <HInput
        v-model="name"
        type="text"
        placeholder="项目名称"
        icon="icon-[mdi--book]"
        :classes="{
          input: 'input input-sm',
          'input-container': 'input-container rounded-md',
          'input-icon': 'input-icon',
        }"
      />
      <HButton
        :classes="{
          base: 'btn btn-md btn-base',
        }"
        @click="updateName"
      >
        {{ t("重命名") }}
      </HButton>
    </div>
    <HButton
      :classes="{
        base: 'btn btn-md btn-base',
      }"
      @click="remove"
      >{{ t("删除项目") }}</HButton
    >
  </div>
</template>
