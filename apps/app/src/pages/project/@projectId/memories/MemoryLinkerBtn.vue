<script setup lang="ts">
import type { Project } from "@cat/shared";

import { Button } from "@cat/ui";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogContent,
  DialogTrigger,
  DialogTitle,
} from "@cat/ui";
import { Link2 } from "@lucide/vue";
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { ref } from "vue";
import { useI18n } from "vue-i18n";

import MultiMemoryPicker from "@/components/MultiMemoryPicker.vue";
import { orpc } from "@/rpc/orpc";
import { useBranchStore } from "@/stores/branch";
import { useToastStore } from "@/stores/toast.ts";

const { t } = useI18n();
const { info, rpcWarn } = useToastStore();

const props = defineProps<{
  project: Project;
}>();

const emits = defineEmits(["link"]);

const branchStore = useBranchStore();
const { currentBranchId, currentProjectId } = storeToRefs(branchStore);

const memoryIds = ref<string[]>([]);

const isOpen = ref(false);

const activeBranchId = computed(() =>
  currentProjectId.value === props.project.id
    ? (currentBranchId.value ?? undefined)
    : undefined,
);

const handleOpen = () => {
  isOpen.value = true;
};

const handleLink = async () => {
  const shouldCreateNew = memoryIds.value.includes("createNew");
  const realIds = memoryIds.value.filter((id) => id !== "createNew");

  if (shouldCreateNew) {
    await orpc.memory.create({
      name: props.project.name,
      projectIds: [props.project.id],
      branchId: activeBranchId.value,
    });
  }

  if (realIds.length > 0) {
    await orpc.project
      .linkMemory({
        projectId: props.project.id,
        memoryIds: realIds,
      })
      .catch(rpcWarn);
  }

  emits("link");
  info("成功连接新的记忆库到此项目");
};
</script>

<template>
  <Dialog>
    <DialogTrigger>
      <Button :class="$attrs.class" @click="handleOpen">
        <Link2 />
        {{ t("连接记忆库") }}</Button
      >
    </DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ t("连接或创建新记忆库") }}</DialogTitle>
        <MultiMemoryPicker v-model="memoryIds" full-width create-new />
        <DialogFooter>
          ><Button @click="handleLink"
            ><div class="icon-[mdi--link] size-4" />
            {{ t("连接") }}</Button
          >
        </DialogFooter>
      </DialogHeader>
    </DialogContent>
  </Dialog>
</template>
