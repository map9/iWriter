<template>
  <svg
    :width="rowLaneCount * laneWidth"
    :height="rowHeight"
    class="block shrink-0"
    :style="{ width: rowLaneCount * laneWidth + 'px', height: rowHeight + 'px' }"
  >
    <path
      v-for="(seg, i) in paths"
      :key="i"
      :d="seg.d"
      :stroke="seg.color"
      stroke-width="2"
      fill="none"
    />
    <circle
      :cx="nodeX"
      :cy="rowHeight / 2"
      :r="hovered ? 4 : 3"
      :fill="unpublished ? 'var(--color-base-100)' : row.color"
      :stroke="unpublished ? row.color : 'var(--color-base-100)'"
      :stroke-width="unpublished ? 2 : 1"
    />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { getGraphRowLaneCount, type GraphRow } from './gitGraphLayout'

const props = withDefaults(
  defineProps<{ row: GraphRow; hovered?: boolean; unpublished?: boolean; laneWidth?: number; rowHeight?: number }>(),
  { laneWidth: 10, rowHeight: 28, hovered: false, unpublished: false },
)

const rowLaneCount = computed(() => getGraphRowLaneCount(props.row))
const colX = (col: number) => col * props.laneWidth + props.laneWidth / 2
const nodeX = computed(() => colX(props.row.nodeCol))

// 每段连线：按 half 决定竖向覆盖范围，控制点置于该带中点做平滑拐弯（端点竖直）。
const paths = computed(() =>
  props.row.segments.map((seg) => {
    const y0 = seg.half === 'bottom' ? props.rowHeight / 2 : 0
    const y1 = seg.half === 'top' ? props.rowHeight / 2 : props.rowHeight
    const xf = colX(seg.fromCol)
    const xt = colX(seg.toCol)
    const ymid = (y0 + y1) / 2
    return { d: `M ${xf} ${y0} C ${xf} ${ymid} ${xt} ${ymid} ${xt} ${y1}`, color: seg.color }
  }),
)
</script>
