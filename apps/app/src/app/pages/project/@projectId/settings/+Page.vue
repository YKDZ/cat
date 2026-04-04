<script setup lang="ts">
import type { Project } from "@cat/shared/schema/drizzle/project";

import { Button } from "@cat/ui";
import { Input } from "@cat/ui";
import { Label } from "@cat/ui";
import { navigate } from "vike/client/router";
import { inject, ref } from "vue";
import { useI18n } from "vue-i18n";

import { orpc } from "@/app/rpc/orpc";
import { useToastStore } from "@/app/stores/toast.ts";
import { useInjectionKey } from "@/app/utils/provide.ts";

import type { Data } from "../+data.server.ts";

import { onProjectDelete } from "./Page.telefunc.ts";
import SnapshotBtn from "./SnapshotBtn.vue";

const { t } = useI18n();
const { rpcWarn } = useToastStore();

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

  await orpc.project
    .update({
      projectId,
      ...data,
    })
    .catch(rpcWarn);
};

const remove = async (): Promise<void> => {
  if (!project) return;

  await onProjectDelete(project.id).then(
    async () => await navigate("/projects"),
  );
};
</script>

<template>
  <div class="mt-2 space-y-2">
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
    <SnapshotBtn />
  </div>
</template>
