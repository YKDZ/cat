<script setup lang="ts">
import type { Project } from "@cat/shared/schema/prisma/project";
import { computed, ref, shallowRef } from "vue";
import { useI18n } from "vue-i18n";
import HButton from "./headless/HButton.vue";
import Table from "@/app/components/table/Table.vue";
import TableBody from "@/app/components/table/TableBody.vue";
import TableCell from "@/app/components/table/TableCell.vue";
import TableRow from "@/app/components/table/TableRow.vue";
import ProjectUploadFilesFile from "./ProjectUploadFilesFile.vue";

const { t } = useI18n();

const fileInputEl = ref<HTMLInputElement>();

defineProps<{
  project: Project;
}>();

const isProcessing = ref<boolean>(false);

const acceptedExt = ref<string[]>(["yml", "yaml", "md", "json"]);

const acceptAttr = computed(() =>
  acceptedExt.value.map((ext) => "." + ext).join(", "),
);

const files = shallowRef<File[]>([]);

const selectFile = () => {
  if (!fileInputEl.value || !fileInputEl.value.files) return;

  const newFiles: File[] = Array.from(fileInputEl.value.files).filter((file) =>
    acceptedExt.value.includes(file.name.split(".").pop() ?? ""),
  );

  files.value = [...files.value, ...newFiles];
  fileInputEl.value.value = "";
};
</script>

<template>
  <!-- Upload File -->
  <div v-if="project" class="flex flex-col gap-2 min-w-screen-lg">
    <p class="text-lg flex items-center">
      <span class="i-mdi:file-upload mr-1 inline-block" />
      为项目
      <span class="font-bold mx-1">{{ project.name }}</span> 上传需要翻译的文件
    </p>
    <input
      ref="fileInputEl"
      type="file"
      multiple
      :accept="acceptAttr"
      class="hidden"
      @change="selectFile"
    />
    <Table class="md:max-w-3/4">
      <TableBody>
        <ProjectUploadFilesFile
          v-for="file in files"
          :key="file.name"
          :file
          :project-id="project.id"
        />
        <TableRow v-if="files.length === 0">
          <TableCell></TableCell>
          <TableCell class="text-center">{{
            t("还没有上传任何文件...")
          }}</TableCell>
          <TableCell></TableCell>
        </TableRow>
      </TableBody>
    </Table>
    <div class="flex gap-4 items-center">
      <HButton
        :classes="{
          base: 'btn btn-md btn-base',
        }"
        icon="i-mdi:folder"
        :is-processing
        @click="fileInputEl && fileInputEl.click()"
      >
        {{ t("选择文件") }}
      </HButton>
    </div>
  </div>
</template>
