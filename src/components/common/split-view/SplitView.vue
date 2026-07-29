<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden">
    <template v-for="item in renderItems" :key="item.pane.id">
      <!-- 拖拽分隔条：仅出现在两个展开 pane 之间 -->
      <div
        v-if="item.splitter"
        class="group relative z-10 h-1 -my-0.5 shrink-0 cursor-row-resize"
        style="touch-action: none"
        @pointerdown="startDrag($event, item.prevId!, item.pane.id)"
      >
        <div
          class="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-base-300 transition-colors group-hover:bg-primary"
          :class="{ 'bg-primary': dragging?.curId === item.pane.id }"
        ></div>
      </div>

      <!-- pane -->
      <section
        :ref="(el) => setPaneEl(item.pane.id, el)"
        class="flex min-h-0 flex-col overflow-hidden"
        :class="item.expanded ? '' : 'shrink-0'"
        :style="item.expanded ? { flexGrow: item.pane.size ?? 1, flexBasis: '0', minHeight: MIN_PANE_PX + 'px' } : undefined"
      >
        <!-- 头部：折叠切换 / 标题 / 徽标 / 操作 / 关闭 -->
        <header
          class="group/head flex h-7 shrink-0 items-center gap-1 bg-base-200 px-1.5 select-none"
          :class="item.canCollapse ? 'cursor-pointer hover:bg-base-300' : ''"
          @click="item.canCollapse && toggleCollapse(item.pane)"
        >
          <component
            :is="item.expanded ? IconChevronDown : IconChevronRight"
            v-if="item.canCollapse"
            class="icon-2xs shrink-0 text-base-content/50"
          />
          <component :is="item.pane.icon" v-if="item.pane.icon" class="icon-2xs shrink-0 text-base-content/60" />
          <span class="flex-1 truncate text-xs font-semibold tracking-wide text-base-content/70 uppercase">
            {{ item.pane.title }}
          </span>
          <span
            v-if="item.pane.badge !== undefined && item.pane.badge !== '' && item.pane.badge !== 0"
            class="badge badge-xs badge-primary shrink-0"
          >{{ item.pane.badge }}</span>

          <div class="hidden shrink-0 items-center gap-0.5 group-hover/head:flex" @click.stop>
            <slot :name="`${item.pane.id}-actions`" :pane="item.pane" />
            <button
              v-if="item.canCollapse"
              class="btn btn-ghost btn-square btn-xs"
              :title="closeTitle"
              @click.stop="close(item.pane)"
            >
              <IconX class="icon-2xs" />
            </button>
          </div>
        </header>

        <!-- 内容：折叠时隐藏 -->
        <div v-show="item.expanded" class="min-h-0 flex-1 overflow-auto">
          <slot :name="item.pane.id" :pane="item.pane" />
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
 
import { computed, ref, onBeforeUnmount } from 'vue'
import { IconChevronDown, IconChevronRight, IconX } from '@tabler/icons-vue'
import type { SplitPane } from './types'

const MIN_PANE_PX = 60

const props = withDefaults(defineProps<{
  panes: SplitPane[]
  closeTitle?: string
}>(), {
  closeTitle: 'Close',
})

const emit = defineEmits<{
  (e: 'collapse', payload: { id: string; collapsed: boolean }): void
  (e: 'close', id: string): void
  (e: 'resize', payload: { id: string; size: number }[]): void
}>()

// 可见 pane
const visiblePanes = computed(() => props.panes.filter(p => p.visible !== false))

// 锚点集合：显式 `collapsible:false` 的 pane；若一个都没有，则第一个可见 pane 兜底为锚点。
// 锚点永不折叠、无折叠图标/关闭按钮、标题不可点击 —— 保证内容区始终至少一个 view 可见。
const anchorIds = computed(() => {
  const explicit = visiblePanes.value.filter(p => p.collapsible === false)
  if (explicit.length) return new Set(explicit.map(p => p.id))
  const first = visiblePanes.value[0]
  return new Set(first ? [first.id] : [])
})

// 渲染项：标注是否可折叠 / 是否展开 / 是否需要在其上方画分隔条、上方展开 pane 的 id
const renderItems = computed(() => {
  let lastExpandedId: string | null = null
  return visiblePanes.value.map(pane => {
    const canCollapse = !anchorIds.value.has(pane.id)
    const expanded = canCollapse ? !pane.collapsed : true
    const splitter = expanded && lastExpandedId !== null
    const prevId = splitter ? lastExpandedId : null
    if (expanded) lastExpandedId = pane.id
    return { pane, canCollapse, expanded, splitter, prevId }
  })
})

function toggleCollapse(pane: SplitPane) {
  pane.collapsed = !pane.collapsed
  emit('collapse', { id: pane.id, collapsed: !!pane.collapsed })
}

function close(pane: SplitPane) {
  pane.visible = false
  emit('close', pane.id)
}

// pane 元素引用（测量高度用）
const paneEls = new Map<string, HTMLElement>()
function setPaneEl(id: string, el: unknown) {
  if (el instanceof HTMLElement) paneEls.set(id, el)
  else paneEls.delete(id)
}

// 拖拽状态
interface DragState {
  prevId: string
  curId: string
  startY: number
  aPx: number
  bPx: number
  totalWeight: number
  prevPane: SplitPane
  curPane: SplitPane
}
const dragging = ref<DragState | null>(null)

function startDrag(e: PointerEvent, prevId: string, curId: string) {
  const aEl = paneEls.get(prevId)
  const bEl = paneEls.get(curId)
  const prevPane = props.panes.find(p => p.id === prevId)
  const curPane = props.panes.find(p => p.id === curId)
  if (!aEl || !bEl || !prevPane || !curPane) return

  dragging.value = {
    prevId, curId,
    startY: e.clientY,
    aPx: aEl.offsetHeight,
    bPx: bEl.offsetHeight,
    totalWeight: (prevPane.size ?? 1) + (curPane.size ?? 1),
    prevPane, curPane,
  }
  ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  document.body.style.cursor = 'row-resize'
  document.body.style.userSelect = 'none'
  window.addEventListener('pointermove', onDrag)
  window.addEventListener('pointerup', stopDrag)
}

function onDrag(e: PointerEvent) {
  const d = dragging.value
  if (!d) return
  const delta = e.clientY - d.startY
  let newA = d.aPx + delta
  let newB = d.bPx - delta
  // 夹取最小高度
  if (newA < MIN_PANE_PX) { newB -= (MIN_PANE_PX - newA); newA = MIN_PANE_PX }
  if (newB < MIN_PANE_PX) { newA -= (MIN_PANE_PX - newB); newB = MIN_PANE_PX }
  const totalPx = newA + newB
  if (totalPx <= 0) return
  d.prevPane.size = d.totalWeight * (newA / totalPx)
  d.curPane.size = d.totalWeight - d.prevPane.size
}

function stopDrag() {
  const d = dragging.value
  window.removeEventListener('pointermove', onDrag)
  window.removeEventListener('pointerup', stopDrag)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  if (d) {
    emit('resize', [
      { id: d.prevId, size: d.prevPane.size ?? 1 },
      { id: d.curId, size: d.curPane.size ?? 1 },
    ])
  }
  dragging.value = null
}

onBeforeUnmount(stopDrag)
</script>
