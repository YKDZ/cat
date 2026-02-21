<script setup lang="ts">
import { useToastStore } from "@/app/stores/toast";
import { useInjectionKey } from "@/app/utils/provide";
import { orpc } from "@/server/orpc";
import { inject } from "vue";
import type { Data } from "../+data.server";
import { useI18n } from "vue-i18n";
import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogContent,
  DialogTrigger,
  DialogTitle,
} from "@/app/components/ui/dialog";

const { info } = useToastStore();
const { t } = useI18n();

const project = inject(useInjectionKey<Data>()("project"))!;

const snapshot = async () => {
  const count = await orpc.project.snapshot({
    projectId: project.id,
  });

  info(`为 ${count} 个元素的翻译拍摄了快照`);
};
</script>

<template>
  <Dialog>
    <DialogTrigger>
      <Button>{{ t("拍摄快照") }}</Button>
    </DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          {{ t("拍摄快照") }}
        </DialogTitle>
      </DialogHeader>
      <article class="prose prose-foreground max-w-460px">
        <p>
          {{
            t(
              "为本项目的所有可翻译元素的已被批准的翻译创建一个快照。快照会记录当前的项目状态，方便后续进行回滚或对比",
            )
          }}
        </p>
      </article>
      <DialogFooter>
        <Button @click="snapshot"
          ><div class="icon-[mdi--camera] size-4" />
          {{ t("拍摄快照") }}</Button
        >
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
