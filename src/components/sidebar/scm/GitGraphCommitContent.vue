<template>
  <span ref="contentEl" class="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
    <span v-if="refs.length" class="flex shrink-0 items-center gap-2">
      <span
        v-for="(ref, index) in refs"
        :key="index"
        class="inline-block rounded px-1 align-middle text-[10px] leading-tight"
        :style="{ backgroundColor: color, color: '#fff' }"
      >{{ ref.name }}</span>
    </span>
    <span class="min-w-0 flex-1 truncate text-base-content">{{ subject }}</span>
    <span v-if="showAuthor" class="shrink-0 whitespace-nowrap text-base-content/50">{{ author }}</span>
  </span>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { GitCommitRef } from '@/types/git'

const props = defineProps<{
  refs: GitCommitRef[]
  subject: string
  author: string
  color: string
}>()

const contentEl = ref<HTMLElement>()
const showAuthor = ref(true)
let resizeObserver: ResizeObserver | undefined

async function updateVisibility(): Promise<void> {
  showAuthor.value = true
  await nextTick()
  if (!contentEl.value || contentEl.value.scrollWidth <= contentEl.value.clientWidth) return

  showAuthor.value = false
}

onMounted(() => {
  resizeObserver = new ResizeObserver(() => { void updateVisibility() })
  if (contentEl.value) resizeObserver.observe(contentEl.value)
  void updateVisibility()
})

onBeforeUnmount(() => resizeObserver?.disconnect())
watch(() => [props.refs, props.subject, props.author, props.color], () => { void updateVisibility() })
</script>
