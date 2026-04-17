<script setup lang="ts">
import { useData } from "vike-vue/useData";
import { useI18n } from "vue-i18n";

import type { Data } from "./+data.ts";

const { t } = useI18n();
const { issue, projectId } = useData<Data>();
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-2">
      <a
        :href="`/project/${projectId}/issues`"
        class="text-sm text-muted-foreground hover:underline"
      >
        ← {{ t("Issues") }}
      </a>
    </div>

    <div class="space-y-2">
      <div class="flex items-center gap-2">
        <h1 class="text-xl font-semibold">{{ issue.title }}</h1>
        <span
          class="rounded-full px-2 py-0.5 text-xs capitalize"
          :class="
            issue.status === 'OPEN'
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-600'
          "
        >
          {{ issue.status.toLowerCase() }}
        </span>
      </div>
      <p class="text-sm text-muted-foreground">#{{ issue.number }}</p>
    </div>

    <div
      v-if="issue.body"
      class="rounded-md border p-4 text-sm whitespace-pre-wrap"
    >
      {{ issue.body }}
    </div>
    <div v-else class="text-sm text-muted-foreground italic">
      {{ t("暂无描述。") }}
    </div>
  </div>
</template>
