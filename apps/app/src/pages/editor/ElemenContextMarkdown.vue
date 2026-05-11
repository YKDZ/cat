<script setup lang="ts">
import type { FlattenedContextEvidence } from "@cat/shared";

import { Card, CardContent } from "@cat/ui";

import Markdown from "@/components/Markdown.vue";

const props = defineProps<{
  context: FlattenedContextEvidence;
}>();

const textData = () => {
  const payload = props.context.payload;
  if (
    payload &&
    typeof payload === "object" &&
    "text" in payload &&
    typeof payload.text === "string"
  ) {
    return payload.text;
  }
  return "";
};
</script>

<template>
  <Card>
    <CardContent>
      <Markdown :content="textData()" size="sm" />
    </CardContent>
  </Card>
</template>
