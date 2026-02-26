/**
 * @shadcn-custom-component
 * description:Table 组件的工具函数，包含 valueUpdater 等辅助函数
 * lastReviewed:2026-02-25
 */

import type { Updater } from "@tanstack/vue-table";

import type { Ref } from "vue";
import { isFunction } from "@tanstack/vue-table";

export function valueUpdater<T>(updaterOrValue: Updater<T>, ref: Ref<T>): void {
  ref.value = isFunction(updaterOrValue) ? updaterOrValue(ref.value) : updaterOrValue;
}
