<script setup lang="ts">
import type { TranslatableElementContext } from "@cat/shared";

import { Card, CardContent } from "@cat/ui";

import Markdown from "@/components/Markdown.vue";

defineProps<{
  context: Pick<TranslatableElementContext, "id" | "textData">;
}>();
</script>

<template>
  <Card>
    <CardContent>
      <Markdown :content="context.textData ?? ''" size="sm" />
    </CardContent>
  </Card>
</template>
