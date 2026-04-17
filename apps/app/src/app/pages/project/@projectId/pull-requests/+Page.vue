<script setup lang="ts">
import { Button } from "@cat/ui";
import { useData } from "vike-vue/useData";
import { navigate } from "vike/client/router";
import { useI18n } from "vue-i18n";

import type { Data } from "./+data.ts";

const { t } = useI18n();
const { pullRequests, projectId } = useData<Data>();
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-lg font-semibold">{{ t("Pull Requests") }}</h1>
      <Button
        v-perm="{ object: 'project', id: projectId, relation: 'editor' }"
        @click="navigate(`/project/${projectId}/pull-requests/new`)"
      >
        <div class="icon-[mdi--plus] size-4" />
        {{ t("New Pull Request") }}
      </Button>
    </div>

    <div v-if="pullRequests.length === 0" class="text-sm text-muted-foreground">
      {{ t("暂无 Pull Request。") }}
    </div>

    <ul v-else class="space-y-2">
      <li
        v-for="pr in pullRequests"
        :key="pr.id"
        class="rounded-md border px-4 py-2 hover:bg-accent"
      >
        <a
          :href="`/project/${projectId}/pull-requests/${pr.number}`"
          class="flex items-center justify-between"
        >
          <span class="font-medium">#{{ pr.number }} {{ pr.title }}</span>
          <span class="text-xs text-muted-foreground capitalize">
            {{ pr.status.toLowerCase() }}
          </span>
        </a>
      </li>
    </ul>
  </div>
</template>
