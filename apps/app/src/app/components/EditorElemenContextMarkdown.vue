<script setup lang="ts">
import type { TranslatableElementContext } from "@cat/shared/schema/drizzle/document";
import Card from "@/app/components/ui/card/Card.vue";
import CardContent from "@/app/components/ui/card/CardContent.vue";
import Markdown from "@/app/components/Markdown.vue";

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
