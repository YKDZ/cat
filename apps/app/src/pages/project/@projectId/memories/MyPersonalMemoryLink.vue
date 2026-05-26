<script setup lang="ts">
import type { Memory } from "@cat/shared";

import { Button, Card, CardContent } from "@cat/ui";
import { UserRound } from "@lucide/vue";
import { navigate } from "vike/client/router";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const props = defineProps<{
  memory: Pick<Memory, "id" | "name">;
}>();

const handleOpen = async () => {
  await navigate(`/memory/${props.memory.id}`);
};
</script>

<template>
  <Card>
    <CardContent
      class="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div class="flex items-center gap-3">
        <div class="rounded-md bg-primary/10 p-2 text-primary">
          <UserRound class="h-4 w-4" />
        </div>
        <div class="space-y-1">
          <p class="text-sm font-medium">{{ t("我的个人记忆") }}</p>
          <p class="text-sm text-muted-foreground">{{ memory.name }}</p>
        </div>
      </div>
      <Button variant="outline" @click="handleOpen">
        {{ t("查看个人记忆") }}
      </Button>
    </CardContent>
  </Card>
</template>
