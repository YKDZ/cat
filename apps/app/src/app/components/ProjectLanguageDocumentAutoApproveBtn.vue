<script setup lang="ts">
import type { Document } from "@cat/shared/schema/drizzle/document";
import { inject } from "vue";
import { useI18n } from "vue-i18n";
import { trpc } from "@cat/app-api/trpc/client";
import { languageKey } from "@/app/utils/provide.ts";
import { useToastStore } from "@/app/stores/toast.ts";
import Button from "./ui/button/Button.vue";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogContent,
  DialogTrigger,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Check } from "lucide-vue-next";

const { t } = useI18n();

const props = defineProps<{
  document: Pick<Document, "id">;
}>();

const { info, trpcWarn } = useToastStore();

const language = inject(languageKey);

const handleAutoApprove = async () => {
  if (!language || !language.value) return;

  await trpc.translation.autoApprove
    .mutate({
      documentId: props.document.id,
      languageId: language.value.id,
    })
    .then((count) => {
      info(`成功自动批准 ${count} 条可用的翻译`);
    })
    .catch(trpcWarn);
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
      <article class="prose-highlight-content max-w-460px prose">
        <h3 class="text-highlight-content-darker">{{ t("自动批准") }}</h3>
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
