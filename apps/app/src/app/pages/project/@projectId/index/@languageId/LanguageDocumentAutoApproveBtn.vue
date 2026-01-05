<script setup lang="ts">
import type { Document } from "@cat/shared/schema/drizzle/document";
import { useI18n } from "vue-i18n";
import { orpc } from "@/server/orpc";
import { useToastStore } from "@/app/stores/toast.ts";
import Button from "@/app/components/ui/button/Button.vue";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogContent,
  DialogTrigger,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Check } from "lucide-vue-next";
import type { Language } from "@cat/shared/schema/drizzle/misc";

const { t } = useI18n();

const props = defineProps<{
  document: Pick<Document, "id">;
  language: Pick<Language, "id">;
}>();

const { info, rpcWarn } = useToastStore();

const handleAutoApprove = async () => {
  if (!props.language) return;

  await orpc.translation
    .autoApprove({
      documentId: props.document.id,
      languageId: props.language.id,
    })
    .then((count) => {
      info(`成功自动批准 ${count} 条可用的翻译`);
    })
    .catch(rpcWarn);
};
</script>

<template>
  <Dialog>
    <DialogTrigger>
      <Button variant="outline" size="icon"><Check /></Button>
    </DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ t("自动批准翻译") }}</DialogTitle>
      </DialogHeader>
      <article class="prose-foreground max-w-460px prose">
        <h3 class="text-foreground">{{ t("自动批准") }}</h3>
        <p>
          {{
            t(
              "这将自动选出各个可翻译元素的翻译中得票数最高的那一个，并自动批准它。",
            )
          }}
        </p>
      </article>
      <DialogFooter>
        <Button @click="handleAutoApprove">确认</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
