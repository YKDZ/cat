<script setup lang="ts">
import { ref } from "vue";

const count = ref(1);
</script>

<template>
  <button class="test" @click="count += 1">{{ count }}</button>
</template>

<style lang="css" scoped>
.test {
  color: black;
  background-color: white;
  display: flex;
  align-items: center;
  justify-items: center;
  font-size: larger;
  padding: 20px;
}
</style>
