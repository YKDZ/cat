<script setup lang="ts">
import type { ContentNode } from "@cat/shared";
import type { Language } from "@cat/shared";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@cat/ui";
import { Check } from "@lucide/vue";
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";

import { orpc } from "#/rpc/orpc.ts";
import { useToastStore } from "#/stores/toast.ts";

const { t } = useI18n();
const hydrated = ref(false);
onMounted(() => {
  hydrated.value = true;
});

const props = defineProps<{
  contentNode: Pick<ContentNode, "id" | "projectId">;
  language: Pick<Language, "id">;
}>();

const { info, rpcWarn } = useToastStore();

const handleAutoApprove = async () => {
  await orpc.translation
    .autoApprove({
      scope: {
        projectId: props.contentNode.projectId,
        contentNodeIds: [props.contentNode.id],
        elementIds: [],
      },
      languageId: props.language.id,
    })
    .then((result) => {
      info(
        t("成功自动批准 {count} 条可用翻译", {
          count: result.count,
        }),
      );
    })
    .catch(rpcWarn);
};
</script>

<template>
  <Dialog v-if="hydrated">
    <DialogTrigger as-child>
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
        <Button @click="handleAutoApprove">{{ t("确认") }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
