<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { Project } from "@cat/shared/schema/drizzle/project";
import ProjectUploadFiles from "./ProjectUploadFiles.vue";
import { Button } from "@/app/components/ui/button";
import { Plus } from "lucide-vue-next";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/app/components/ui/dialog";

defineProps<{
  project: Project;
}>();

const { t } = useI18n();
</script>

<template>
  <Dialog>
    <DialogTrigger>
      <Button :class="$attrs.class"><Plus /> {{ t("上传文件") }}</Button>
    </DialogTrigger>
    <DialogContent>
      <ProjectUploadFiles :project />
    </DialogContent>
  </Dialog>
</template>
