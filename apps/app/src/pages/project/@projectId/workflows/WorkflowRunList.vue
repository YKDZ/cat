<script setup lang="ts">
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@cat/ui";
import { navigate } from "vike/client/router";
import { useI18n } from "vue-i18n";

import { formatTimestamp } from "#/utils/format.ts";

const { locale, t } = useI18n();

const props = defineProps<{
  runs: Array<{
    id: string;
    sessionId: string;
    status: string;
    graphDefinition: unknown;
    currentNodeId: string | null;
    startedAt: Date;
    completedAt: Date | null;
    metadata: unknown;
  }>;
  projectId: string;
}>();

const statusVariant = (
  status: string,
): "secondary" | "outline" | "destructive" => {
  if (status === "failed") return "destructive";
  if (status === "completed") return "secondary";
  return "outline";
};

const formatRunDate = (date: Date | null): string =>
  date ? formatTimestamp(date, locale.value) : "—";
</script>

<template>
  <div class="rounded-md border">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{{ t("运行 ID") }}</TableHead>
          <TableHead>{{ t("运行状态") }}</TableHead>
          <TableHead>{{ t("开始时间") }}</TableHead>
          <TableHead>{{ t("完成时间") }}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow
          v-for="run in props.runs"
          :key="run.id"
          class="cursor-pointer hover:bg-muted/50"
          @click="navigate(`/project/${props.projectId}/workflows/${run.id}`)"
        >
          <TableCell class="font-mono text-xs">{{ run.id }}</TableCell>
          <TableCell>
            <Badge :variant="statusVariant(run.status)">{{
              t(run.status)
            }}</Badge>
          </TableCell>
          <TableCell class="text-sm text-muted-foreground">{{
            formatRunDate(run.startedAt)
          }}</TableCell>
          <TableCell class="text-sm text-muted-foreground">{{
            formatRunDate(run.completedAt)
          }}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
</template>
