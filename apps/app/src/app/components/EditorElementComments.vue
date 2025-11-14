<script setup lang="ts">
import EditorElementComment from "@/app/components/EditorElementComment.vue";
import { useEditorTableStore } from "@/app/stores/editor/table";
import { computedAsyncClient } from "@/app/utils/vue";
import { trpc } from "@cat/app-api/trpc/client";
import { storeToRefs } from "pinia";

const { elementId } = storeToRefs(useEditorTableStore());

const rootComments = computedAsyncClient(async () => {
  if (!elementId.value) return [];
  return await trpc.element.getRootComments.query({
    elementId: elementId.value,
    pageIndex: 0,
    pageSize: 10,
  });
}, []);
</script>

<template>
  <EditorElementComment
    v-for="comment in rootComments"
    :key="comment.id"
    :comment
  />
</template>
