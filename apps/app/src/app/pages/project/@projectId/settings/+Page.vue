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
import type { Project } from "@cat/shared/schema/drizzle/project";
import { useToastStore } from "@/app/stores/toast.ts";
import { onProjectDelete } from "./Page.telefunc.ts";

const { t } = useI18n();
const { trpcWarn } = useToastStore();

const project = inject(useInjectionKey<Data>()("project"))!;
const name = ref(project.name);

const updateName = async (): Promise<void> => {
  if (!project) return;
  update(project.id, { name: name.value });
};

const update = async (
  projectId: string,
  data: Partial<Pick<Project, "name">> = {},
): Promise<void> => {
  if (!project) return;

  await trpc.project.update
    .mutate({
      projectId,
      ...data,
    })
    .catch(trpcWarn);
};

const remove = async (): Promise<void> => {
  if (!project) return;

  await onProjectDelete(project.id).then(
    async () => await navigate("/projects"),
  );
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
        <Button @click="updateName"> {{ t("重命名") }} </Button>
      </div>
    </div>
    <Button variant="destructive" @click="remove">{{ t("删除项目") }}</Button>
  </div>
</template>
