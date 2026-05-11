<script setup lang="ts">
import type { FlattenedContextEvidence } from "@cat/shared";

import { Card, CardContent } from "@cat/ui";
import { computed } from "vue";
import * as z from "zod";

const props = defineProps<{
  context: FlattenedContextEvidence;
}>();

const meta = computed(() => {
  const payload = props.context.payload;
  if (
    payload &&
    typeof payload === "object" &&
    "json" in payload &&
    payload.json
  ) {
    return z.record(z.string(), z.unknown()).safeParse(payload.json).data ?? {};
  }
  if (payload && typeof payload === "object") {
    return z.record(z.string(), z.unknown()).safeParse(payload).data ?? {};
  }
  return {};
});

const keys = computed(() => {
  const editorDisplay = meta.value["editor-display"];
  if (editorDisplay && z.array(z.string()).parse(editorDisplay))
    return z
      .array(z.string())
      .parse(editorDisplay)
      .filter((key) => meta.value[key] !== null)
      .sort();
  return Object.keys(meta.value)
    .filter((key) => meta.value[key] !== null)
    .sort();
});
</script>

<template>
  <Card>
    <CardContent>
      <div class="flex flex-col gap-1">
        <div v-for="key in keys" :key="key">
          <span
            class="mr-1 rounded-sm bg-muted px-2 py-1 text-muted-foreground select-none"
            >{{ key }}</span
          ><span class="break-all">{{ meta[key] }}</span>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
