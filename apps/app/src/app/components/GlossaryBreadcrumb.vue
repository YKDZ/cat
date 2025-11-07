<script setup lang="ts">
import type { Glossary } from "@cat/shared/schema/drizzle/glossary";
import type { User } from "@cat/shared/schema/drizzle/user";
import Slash from "./Slash.vue";
import UserAvatar from "./UserAvatar.vue";

defineProps<{
  glossary: Pick<Glossary, "name"> & {
    Creator: Pick<User, "id" | "name">;
  };
}>();
</script>

<template>
  <div class="text-lg font-500 flex items-center">
    <UserAvatar :user="glossary.Creator" :size="30" with-name link />
    <Slash large />{{ glossary.name }}
  </div>
</template>
