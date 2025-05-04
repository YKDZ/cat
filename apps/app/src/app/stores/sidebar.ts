import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { isLowWidth } from "../utils/window";

export const useSidebarStore = defineStore("sidebar", () => {
  const isFree = ref<boolean>(false);
  const isFolding = ref<boolean>(true);
  const width = ref<number>(288);
  const storedWidth = ref<number>(288);

  const changeFold = (to: boolean) => {
    if (to) {
      storedWidth.value = width.value;
      if (isLowWidth.value) width.value = 0;
      else width.value = 16;
    } else width.value = storedWidth.value;
  };

  const realIsFolding = computed(() => {
    if (!isFree.value) return false;
    return isFolding.value;
  });

  return {
    isFree,
    isFolding,
    realIsFolding,
    width,
    changeFold,
  };
});
