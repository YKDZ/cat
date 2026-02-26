<script setup lang="ts">
import type { Project } from "@cat/shared/schema/drizzle/project";
import Slash from "@/app/components/Slash.vue";
import UserAvatar from "@/app/components/UserAvatar.vue";

defineProps<{
  project: Project;
}>();
</script>

<template>
  <div class="font-500 flex items-center text-lg">
    <UserAvatar :user-id="project.creatorId" :size="30" with-name link />
    <Slash large />{{ project.name }}
  </div>
</template>
