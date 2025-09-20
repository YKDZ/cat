<script setup lang="ts">
type Classes = {
  form?: string;
};

defineProps<{
  classes?: Classes;
}>();
</script>

<template>
  <form :class="[classes?.form]"><slot /></form>
</template>
