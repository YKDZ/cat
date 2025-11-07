<script setup lang="ts">
import { navigate } from "vike/client/router";
import { inject, ref } from "vue";
import { useI18n } from "vue-i18n";
import { trpc } from "@cat/app-api/trpc/client";
import type { Data } from "../+data.server.ts";
import { useInjectionKey } from "@/app/utils/provide.ts";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";

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
  <div class="space-y-2 mt-2">
    <div class="grid w-full max-w-sm items-center gap-1.5">
      <Label for="name">{{ t("项目名称") }}</Label>
      <div class="flex w-full max-w-sm items-center gap-1.5">
        <Input
          id="name"
          type="text"
          v-model="name"
          :placeholder="t('项目名称')"
        />
        <Button type="submit" @click="updateName"> {{ t("重命名") }} </Button>
      </div>
    </div>
    <Button variant="destructive" @click="remove">{{ t("删除项目") }}</Button>
  </div>
</template>
