<script setup lang="ts">
import { useData } from "vike-vue/useData";
import { useI18n } from "vue-i18n";

import type { Data } from "./+data.ts";

const { t } = useI18n();
const { issues, projectId } = useData<Data>();
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-lg font-semibold">{{ t("Issues") }}</h1>
    </div>

    <div v-if="issues.length === 0" class="text-sm text-muted-foreground">
      {{ t("暂无 Issue。") }}
    </div>

    <ul v-else class="space-y-2">
      <li
        v-for="issue in issues"
        :key="issue.id"
        class="rounded-md border px-4 py-2 hover:bg-accent"
      >
        <a
          :href="`/project/${projectId}/issues/${issue.number}`"
          class="flex items-center justify-between"
        >
          <span class="font-medium">#{{ issue.number }} {{ issue.title }}</span>
          <span
            class="text-xs capitalize"
            :class="
              issue.status === 'OPEN'
                ? 'text-green-600'
                : 'text-muted-foreground'
            "
          >
            {{ issue.status.toLowerCase() }}
          </span>
        </a>
      </li>
    </ul>
  </div>
</template>
