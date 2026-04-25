<script setup lang="ts">
import type { Project } from "@cat/shared";

import BranchCombobox from "@/app/components/shared/BranchCombobox.vue";
import Slash from "@/app/components/Slash.vue";
import UserAvatar from "@/app/components/UserAvatar.vue";

defineProps<{
  project: Project;
}>();
</script>

<template>
  <div class="font-500 flex items-center gap-2 text-lg">
    <UserAvatar :user-id="project.creatorId" :size="30" with-name link />
    <Slash large />
    {{ project.name }}
    <BranchCombobox :project-id="project.id" />
  </div>
</template>
