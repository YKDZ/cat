<script setup lang="ts">
import Button from "@/app/components/Button.vue";
import LanguagePicker from "@/app/components/LanguagePicker.vue";
import { PickerOption } from "@/app/components/picker";
import Table from "@/app/components/table/Table.vue";
import TableBody from "@/app/components/table/TableBody.vue";
import TableCell from "@/app/components/table/TableCell.vue";
import TableHead from "@/app/components/table/TableHead.vue";
import TableHeader from "@/app/components/table/TableHeader.vue";
import TableRow from "@/app/components/table/TableRow.vue";
import { useProjectStore } from "@/app/stores/project";
import { useToastStore } from "@/app/stores/toast";
import { trpc } from "@/server/trpc/client";
import { Project } from "@cat/shared";
import { usePageContext } from "vike-vue/usePageContext";
import { navigate } from "vike/client/router";
import { ref, warn, watch } from "vue";

const ctx = usePageContext();

const { addProjects } = useProjectStore();

const project = ref<Project | null>(null);

watch(
  () => ctx.routeParams.projectId,
  () => {
    project.value =
      useProjectStore().projects.find(
        (project) => project.id === ctx.routeParams.projectId,
      ) ?? null;
  },
  { immediate: true },
);

const { trpcWarn } = useToastStore();

const languageId = ref<string>("");

const addNewLanguage = () => {
  if (!project.value) {
    warn("你还没有选择项目");
    return;
  }
  if (languageId.value === "") {
    warn("你还没有选择语言");
    return;
  }
  if (
    project.value.TargetLanguages?.find(
      (language) => language.id === languageId.value,
    )
  ) {
    warn("该语言已存在");
    return;
  }

  trpc.project.addNewLanguage
    .mutate({
      projectId: project.value.id,
      languageId: languageId.value,
    })
    .then((newProject) => {
      addProjects(newProject);
    })
    .catch(trpcWarn);
};

const langFilter = (option: PickerOption) => {
  if (!project.value) {
    warn("你还没有选择项目");
    return false;
  }
  return (
    option.value !== project.value.SourceLanguage?.id &&
    !project.value.TargetLanguages?.map((language) => language.id).includes(
      option.value,
    )
  );
};
</script>

<template>
  <Table>
    <TableHeader>
      <TableHead>项目语言</TableHead>
    </TableHeader>
    <TableBody v-if="project">
      <TableRow
        v-for="language in project.TargetLanguages"
        :key="language.id"
        class="cursor-pointer hover:bg-highlight-darker"
        @click="navigate(`/project/${project.id}/${language.id}`)"
      >
        <TableCell>{{ language.name }}</TableCell>
        <TableCell>0%</TableCell>
      </TableRow>
    </TableBody>
  </Table>
  <LanguagePicker v-model:language-id="languageId" :filter="langFilter" />
  <Button
    icon="i-mdi:plus"
    :disabled="languageId === ``"
    @click="addNewLanguage"
    >添加新语言并开始翻译</Button
  >
</template>
