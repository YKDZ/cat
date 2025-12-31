<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { orpc } from "@/server/orpc";
import type { Project } from "@cat/shared/schema/drizzle/project";
import MultiGlossaryPicker from "./MultiGlossaryPicker.vue";
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

const emits = defineEmits(["link"]);

const props = defineProps<{
  project: Project;
}>();

const glossaryIds = ref<string[]>([]);

const handleLink = async () => {
  const createNewIndex = glossaryIds.value.findIndex(
    (id) => id === "createNew",
  );
  const realIds = glossaryIds.value.splice(createNewIndex, 1);

  if (createNewIndex !== -1) {
    await orpc.glossary.create({
      name: props.project.name,
      projectIds: [props.project.id],
    });
  }

  await orpc.project
    .linkGlossary({
      projectId: props.project.id,
      glossaryIds: realIds,
    })
    .then(() => {
      emits("link");
      info("成功连接新的术语库到此项目");
    })
    .catch(rpcWarn);
};
</script>

<template>
  <Dialog>
    <DialogTrigger>
      <Button :class="$attrs.class"><Link2 /> {{ t("连接术语库") }}</Button>
    </DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          {{ t("连接或创建新术语库") }}
        </DialogTitle>
      </DialogHeader>
      <MultiGlossaryPicker v-model="glossaryIds" full-width create-new />
      <DialogFooter>
        <Button @click="handleLink"
          ><div class="icon-[mdi--link] size-4" />
          {{ t("连接") }}</Button
        >
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
