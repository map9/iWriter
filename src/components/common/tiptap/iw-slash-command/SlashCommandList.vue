<template>
  <div
    ref="listEl"
    class="fixed w-64 bg-base-100 border border-base-300 rounded-field shadow-sm z-1200 py-1.5 px-1.5 max-h-72 overflow-y-auto"
  >
    <template v-if="groups.length > 0">
      <div v-for="group in groups" :key="group.key">
        <div class="px-1.5 pt-1 pb-0.5 text-xs font-semibold text-base-content/40 select-none">
          {{ t(group.key) }}
        </div>
        <button
          v-for="item in group.items"
          :key="item.id"
          :ref="el => setItemRef(item.globalIndex, el)"
          @click="selectItem(item.globalIndex)"
          @mouseenter="highlightedIndex = item.globalIndex"
          class="w-full flex items-center gap-2 px-2 py-1.5 rounded-field text-xs text-left transition-colors"
          :class="highlightedIndex === item.globalIndex ? 'bg-base-300' : 'hover:bg-base-200'"
        >
          <component :is="item.icon" class="icon-xs shrink-0 text-base-content/70" />
          <span class="truncate flex-1 text-base-content">{{ t(item.labelKey) }}</span>
          <span class="shrink-0 text-base-content/40 truncate max-w-24 text-right">{{ t(item.descKey) }}</span>
        </button>
      </div>
    </template>
    <div v-else class="px-2 py-2 text-xs text-base-content/50 text-center select-none">
      {{ t('slashCommand.noResults') }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SlashCommandItem } from './commands'

const props = defineProps<{
  items: SlashCommandItem[]
  command: (item: SlashCommandItem) => void
}>()

const { t } = useI18n()
const listEl = ref<HTMLElement | null>(null)
const highlightedIndex = ref(0)

/** 按 globalIndex 存储条目 DOM 引用，用于 scrollIntoView */
const itemRefs = ref<(Element | null)[]>([])
function setItemRef(index: number, el: unknown) {
  itemRefs.value[index] = el instanceof Element ? el : null
}

// 分组结构，附带全局索引
const groups = computed(() => {
  const groupMap = new Map<string, { key: string; items: (SlashCommandItem & { globalIndex: number })[] }>()
  props.items.forEach((item, i) => {
    if (!groupMap.has(item.groupKey)) {
      groupMap.set(item.groupKey, { key: item.groupKey, items: [] })
    }
    groupMap.get(item.groupKey)!.items.push({ ...item, globalIndex: i })
  })
  return [...groupMap.values()]
})

// 过滤结果变化时重置高亮到第一项
watch(() => props.items, () => {
  highlightedIndex.value = 0
  itemRefs.value = []
})

function selectItem(index: number) {
  const item = props.items[index]
  if (item) props.command(item)
}

function scrollItemIntoView(index: number) {
  nextTick(() => {
    const el = itemRefs.value[index] as HTMLElement | null
    const container = listEl.value
    if (!el || !container) return
    const elRect = el.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    if (elRect.top < containerRect.top) {
      container.scrollTop -= containerRect.top - elRect.top
    } else if (elRect.bottom > containerRect.bottom) {
      container.scrollTop += elRect.bottom - containerRect.bottom
    }
  })
}

/** suggestion render() 通过 ref 调用此方法处理编辑器键盘事件 */
function onKeyDown({ event }: { event: KeyboardEvent }): boolean {
  if (event.key === 'ArrowDown') {
    const next = (highlightedIndex.value + 1) % Math.max(props.items.length, 1)
    highlightedIndex.value = next
    scrollItemIntoView(next)
    return true
  }
  if (event.key === 'ArrowUp') {
    const prev = (highlightedIndex.value - 1 + Math.max(props.items.length, 1)) % Math.max(props.items.length, 1)
    highlightedIndex.value = prev
    scrollItemIntoView(prev)
    return true
  }
  if (event.key === 'Enter') {
    selectItem(highlightedIndex.value)
    return true
  }
  // Escape: 返回 false，让 suggestion 自行关闭
  return false
}

defineExpose({ onKeyDown })
</script>
