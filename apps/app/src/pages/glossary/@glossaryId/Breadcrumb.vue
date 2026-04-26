<script setup lang="ts">
import type { Glossary } from "@cat/shared";

import Slash from "@/components/Slash.vue";
import UserAvatar from "@/components/UserAvatar.vue";

defineProps<{
  glossary: Pick<Glossary, "name" | "creatorId">;
}>();
</script>

<template>
  <div class="font-500 flex items-center text-lg">
    <UserAvatar :user-id="glossary.creatorId" :size="30" with-name link />
    <Slash large />{{ glossary.name }}
  </div>
</template>
