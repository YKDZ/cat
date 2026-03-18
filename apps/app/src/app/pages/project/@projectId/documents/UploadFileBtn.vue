<script setup lang="ts">
import type { Project } from "@cat/shared/schema/drizzle/project";

import { Button } from "@cat/ui";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@cat/ui";
import { Plus } from "lucide-vue-next";
import { useI18n } from "vue-i18n";

import ProjectUploadFiles from "@/app/components/ProjectUploadFiles.vue";

defineProps<{
  project: Project;
}>();


const { t } = useI18n();
</script>

<template>
  <Dialog>
    <DialogTrigger as-child>
      <Button :class="$attrs.class"><Plus /> {{ t("上传文件") }}</Button>
    </DialogTrigger>

    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          {{ t("上传文件") }}
        </DialogTitle>
        <DialogDescription>
          {{
            t("为项目 {name} 上传需要翻译的文件", {
              name: project.name,
            })
          }}
        </DialogDescription>
      </DialogHeader>
      <ProjectUploadFiles :project />
    </DialogContent>
  </Dialog>
</template>
