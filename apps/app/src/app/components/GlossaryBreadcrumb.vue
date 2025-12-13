<script setup lang="ts">
import type { Glossary } from "@cat/shared/schema/drizzle/glossary";
import Slash from "./Slash.vue";
import UserAvatar from "./UserAvatar.vue";

defineProps<{
  glossary: Pick<Glossary, "name" | "creatorId">;
}>();
</script>

<template>
  <div class="text-lg font-500 flex items-center">
    <UserAvatar :user-id="glossary.creatorId" :size="30" with-name link />
    <Slash large />{{ glossary.name }}
  </div>
</template>
