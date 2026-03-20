<script setup lang="ts">
/**
 * @shadcn-custom-component
 * description: Custom animated DAG edge for Vue Flow with conditional label support
 * lastReviewed: 2026-03-20
 */
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@vue-flow/core";
import { computed } from "vue";

import type { DagEdgeData } from "./types";

type DagEdgeProps = EdgeProps & {
  data?: DagEdgeData;
};


const props = defineProps<DagEdgeProps>();


const pathData = computed(() =>
  getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
  }),
);


const [edgePath, labelX, labelY] = computed(() => pathData.value).value;


const isAnimated = computed(
  () => props.animated ?? props.data?.animated ?? false,
);
const hasLabel = computed(
  () => !!(props.label ?? props.data?.condition ?? props.data?.label),
);
const labelText = computed(
  () => props.label ?? props.data?.condition ?? props.data?.label ?? "",
);
</script>

<template>
  <BaseEdge
    :id="id"
    :path="edgePath"
    :style="{
      stroke: isAnimated ? '#3b82f6' : undefined,
      strokeDasharray: data?.condition ? '6 3' : undefined,
    }"
  />

  <!-- Animated flow dot -->
  <template v-if="isAnimated">
    <circle r="4" fill="#3b82f6">
      <animateMotion :dur="`${1.5}s`" repeatCount="indefinite">
        <mpath :href="`#${id}`" />
      </animateMotion>
    </circle>
  </template>

  <EdgeLabelRenderer v-if="hasLabel">
    <div
      :style="{
        position: 'absolute',
        transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
        pointerEvents: 'all',
      }"
      class="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium shadow-sm"
    >
      {{ labelText }}
    </div>
  </EdgeLabelRenderer>
</template>
