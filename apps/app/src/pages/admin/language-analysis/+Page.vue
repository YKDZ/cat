<script setup lang="ts">
import {
  normalizeLanguageId,
  toLanguageAnalysisSelectionKey,
  type LanguageAnalysisSelection,
  type LanguageAnalysisObservationView,
  type ServiceImplementationReference,
} from "@cat/shared";
import { Button, Input } from "@cat/ui";
import { onMounted, ref } from "vue";

import { orpc } from "#/rpc/orpc.ts";
import { useToastStore } from "#/stores/toast.ts";

const toast = useToastStore();
const selections = ref<LanguageAnalysisSelection[]>([]);
const implementations = ref<ServiceImplementationReference[]>([]);
const key = ref("*");
const implementationKey = ref("");
const saving = ref(false);
const diagnostic = ref<LanguageAnalysisObservationView>();

const refresh = async () => {
  const [nextSelections, nextImplementations] = await Promise.all([
    orpc.languageAnalysis.listSelections({}),
    orpc.languageAnalysis.listImplementations({}),
  ]);
  selections.value = nextSelections;
  implementations.value = nextImplementations;
};

const select = async (selection: LanguageAnalysisSelection) => {
  key.value = selection.key;
  implementationKey.value = selection.implementation
    ? JSON.stringify(selection.implementation)
    : "";
  diagnostic.value =
    selection.key === "*"
      ? undefined
      : await orpc.languageAnalysis.getObservation(selection.key);
};

const save = async () => {
  saving.value = true;
  try {
    const current = selections.value.find((item) => item.key === key.value);
    const selected = implementations.value.find(
      (item) => JSON.stringify(item) === implementationKey.value,
    );
    await orpc.languageAnalysis.writeSelection({
      expectedRevision: current?.revision ?? 0,
      implementation: selected ?? null,
      key:
        key.value === "*"
          ? "*"
          : toLanguageAnalysisSelectionKey(normalizeLanguageId(key.value)),
    });
    await refresh();
    const updated = selections.value.find((item) => item.key === key.value);
    if (updated) await select(updated);
  } catch (error) {
    toast.rpcWarn(error);
  } finally {
    saving.value = false;
  }
};

onMounted(() => void refresh());
</script>

<template>
  <div class="grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
    <div class="overflow-x-auto border">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b text-left">
            <th class="p-2">Language</th>
            <th class="p-2">Implementation</th>
            <th class="p-2">Revision</th>
            <th class="p-2">Fingerprint</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="selection in selections"
            :key="selection.key"
            class="cursor-pointer border-b hover:bg-muted/50"
            @click="void select(selection)"
          >
            <td class="p-2">{{ selection.key }}</td>
            <td class="p-2">
              {{ selection.implementation?.pluginId ?? "Deleted" }}
            </td>
            <td class="p-2">{{ selection.revision }}</td>
            <td class="max-w-52 truncate p-2 font-mono text-xs">
              {{ selection.configurationFingerprint ?? "Missing" }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <form class="grid content-start gap-3" @submit.prevent="save">
      <Input v-model="key" aria-label="Language" />
      <select v-model="implementationKey" class="h-9 border px-2">
        <option value="">Deleted</option>
        <option
          v-for="implementation in implementations"
          :key="JSON.stringify(implementation)"
          :value="JSON.stringify(implementation)"
        >
          {{ implementation.pluginId }} / {{ implementation.serviceId }}
        </option>
      </select>
      <Button type="submit" :disabled="saving">Save</Button>
      <dl class="grid gap-2 border-t pt-3 text-sm">
        <div>
          <dt class="text-muted-foreground">Source</dt>
          <dd>
            {{ diagnostic?.source ?? (key === "*" ? "WILDCARD" : "EXACT") }}
          </dd>
        </div>
        <div>
          <dt class="text-muted-foreground">Revision</dt>
          <dd>{{ diagnostic?.selection?.revision ?? "Missing" }}</dd>
        </div>
        <div>
          <dt class="text-muted-foreground">Fingerprint</dt>
          <dd class="font-mono text-xs break-all">
            {{ diagnostic?.selection?.configurationFingerprint ?? "Missing" }}
          </dd>
        </div>
        <div>
          <dt class="text-muted-foreground">Observed</dt>
          <dd>
            {{
              diagnostic?.observation?.observedAt?.toLocaleString() ?? "Unknown"
            }}
          </dd>
        </div>
        <div>
          <dt class="text-muted-foreground">Implementation</dt>
          <dd>
            {{ diagnostic?.selection?.implementation?.pluginId ?? "Missing" }}
          </dd>
        </div>
        <div>
          <dt class="text-muted-foreground">Blocker</dt>
          <dd>
            {{
              diagnostic?.assessment.blocker?.reason ??
              diagnostic?.assessment.status ??
              "Unknown"
            }}
          </dd>
        </div>
        <div>
          <dt class="text-muted-foreground">Remediation</dt>
          <dd>{{ diagnostic?.assessment.blocker?.remediation ?? "None" }}</dd>
        </div>
      </dl>
    </form>
  </div>
</template>
