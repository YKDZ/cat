<script setup lang="ts">
import { computed } from "vue";
import * as z from "zod/v4";
import type { TranslatableElementContext } from "@cat/shared/schema/drizzle/document";
import Card from "@/app/components/ui/card/Card.vue";
import CardContent from "@/app/components/ui/card/CardContent.vue";

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
            class="mr-1 px-2 py-1 rounded-sm bg-muted text-muted-foreground select-none"
            >{{ key }}</span
          ><span class="break-all">{{ meta[key] }}</span>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
