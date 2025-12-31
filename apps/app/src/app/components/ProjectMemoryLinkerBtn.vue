<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { orpc } from "@/server/orpc";
import type { Project } from "@cat/shared/schema/drizzle/project";
import MultiMemoryPicker from "./MultiMemoryPicker.vue";
import { useToastStore } from "@/app/stores/toast.ts";
import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogContent,
  DialogTrigger,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Link2 } from "lucide-vue-next";

const { t } = useI18n();
const { info, rpcWarn } = useToastStore();

const props = defineProps<{
  project: Project;
}>();

const emits = defineEmits(["link"]);

const memoryIds = ref<string[]>([]);

const isOpen = ref(false);

const handleOpen = () => {
  isOpen.value = true;
};

const handleLink = async () => {
  const createNewIndex = memoryIds.value.findIndex((id) => id === "createNew");
  const realIds = memoryIds.value.splice(createNewIndex, 1);

  if (createNewIndex !== -1) {
    await orpc.memory.create({
      name: props.project.name,
      projectIds: [props.project.id],
    });
  }

  await orpc.project
    .linkMemory({
      projectId: props.project.id,
      memoryIds: realIds,
    })
    .then(() => {
      emits("link");
      info("成功连接新的记忆库到此项目");
    })
    .catch(rpcWarn);
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
          <Button @click="handleLink">{{ t("连接") }}</Button
          ><Button @click="handleLink"
            ><div class="icon-[mdi--link] size-4" />
            {{ t("连接") }}</Button
          >
        </DialogFooter>
      </DialogHeader>
    </DialogContent>
  </Dialog>
</template>
