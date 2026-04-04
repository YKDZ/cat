<script setup lang="ts">
import type { TranslatableElementContext } from "@cat/shared/schema/drizzle/document";

import { Card, CardContent } from "@cat/ui";
import { computed } from "vue";
import * as z from "zod/v4";

type MakeOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

const props = defineProps<{
  context: MakeOptional<
    Pick<TranslatableElementContext, "id" | "jsonData">,
    "jsonData"
  >;
}>();

const meta = computed(() => {
  return z.record(z.string(), z.unknown()).parse(props.context.jsonData);
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
