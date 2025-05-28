import { computed } from "vue";

export const isLowWidth = computed(() => window.innerWidth < 768);
