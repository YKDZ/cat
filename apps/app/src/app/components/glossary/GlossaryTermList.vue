<script setup lang="ts">
import { inject, onMounted, ref } from "vue";
import type { TermRelation } from "@cat/shared/schema/prisma/glossary";
import type { TermListFilterOptions } from "./index.ts";
import Table from "@/app/components/table/Table.vue";
import TableBody from "@/app/components/table/TableBody.vue";
import { glossaryKey } from "@/app/utils/provide.ts";
import { trpc } from "@cat/app-api/trpc/client";
import GlossaryTermListItem from "@/app/components/glossary/GlossaryTermListItem.vue";
import GlossaryInsertTermBtn from "@/app/components/GlossaryInsertTermBtn.vue";
import GlossaryTermListFilter from "@/app/components/glossary/GlossaryTermListFilter.vue";

const terms = ref<TermRelation[]>([]);

const glossary = inject(glossaryKey);

const updateTerms = async (options: TermListFilterOptions) => {
  if (!glossary) return;

  await trpc.glossary.queryTerms
    .query({
      id: glossary.id,
      ...options,
    })
    .then((ts) => (terms.value = ts));
};

const handleDeleteTerm = (id: number) => {
  terms.value = terms.value.filter((term) => term.Term!.id !== id);
};

onMounted(() =>
  updateTerms({ sourceLanguageId: null, translationLanguageId: null }),
);
</script>

<template>
  <div class="flex justify-between">
    <GlossaryTermListFilter @filter="updateTerms" />
    <GlossaryInsertTermBtn v-if="glossary" :glossary-id="glossary.id" />
  </div>
  <Table>
    <TableBody>
      <GlossaryTermListItem
        v-for="term in terms"
        :key="term.Term?.id"
        :term
        @delete="handleDeleteTerm(term.Term!.id)"
      />
    </TableBody>
  </Table>
</template>
