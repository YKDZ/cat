<script setup lang="ts">
const isChecked = defineModel<boolean>({ required: true });

const emits = defineEmits(["change"]);
</script>

<template>
  <div class="flex items-center">
    <label for="toggle" class="flex cursor-pointer items-center">
      <div class="relative">
        <input
          id="toggle"
          v-model="isChecked"
          type="checkbox"
          class="hidden"
          @change="emits('change')"
        />
        <div
          class="rounded-sm h-6 w-12 transition-colors duration-100 ease-in-out"
          :class="{
            'bg-base-darker': isChecked,
            'bg-highlight-darker': !isChecked,
          }"
        ></div>
        <div
          class="rounded-sm bg-white h-6 w-6 shadow-lg transform transition-all duration-100 ease-in-out left-0 top-0 absolute"
          :class="{
            'translate-x-7': isChecked,
          }"
        ></div>
      </div>
    </label>
  </div>
</template>
