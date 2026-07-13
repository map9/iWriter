<template>
  <div
    v-if="issue"
    class="fixed inset-0 z-1000 flex items-center justify-center bg-black/45 backdrop-blur-sm"
    tabindex="-1"
    @click.self="emit('close')"
    @keydown.esc="emit('close')"
  >
    <section class="w-96 max-w-[90vw] overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-2xl" role="dialog" aria-modal="true">
      <div class="border-b border-base-300 px-4 py-3 text-sm font-semibold">{{ title }}</div>
      <div class="space-y-3 px-4 py-4">
        <p class="text-sm text-base-content/80">{{ message }}</p>
        <details v-if="issue.detail" class="rounded-field border border-base-300 bg-base-200/40">
          <summary class="cursor-pointer px-3 py-2 text-xs text-base-content/70 hover:bg-base-200">
            {{ t('sourceControl.error.technicalDetails') }}
          </summary>
          <div class="border-t border-base-300 p-2">
            <pre class="max-h-44 overflow-auto whitespace-pre-wrap break-words text-2xs text-base-content/70">{{ issue.detail }}</pre>
            <button class="iw-btn btn-ghost btn-xs mt-2" @click="copyDetails">
              {{ t('sourceControl.error.copyDetails') }}
            </button>
          </div>
        </details>
      </div>
      <div class="flex justify-end gap-2 border-t border-base-300 px-4 py-3">
        <button class="iw-btn btn-ghost btn-sm" @click="emit('close')">{{ t('common.close') }}</button>
        <button v-if="issue.kind === 'branch-unmerged'" class="iw-btn btn-error btn-sm" @click="emit('force-delete')">
          {{ t('sourceControl.branch.forceDeleteConfirm') }}
        </button>
        <button v-else class="iw-btn btn-primary btn-sm" @click="emit('retry')">{{ t('sourceControl.error.retry') }}</button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { GitIssue } from '@/types/git'

const props = defineProps<{ issue: GitIssue | null }>()
const emit = defineEmits<{ close: []; retry: []; 'force-delete': [] }>()
const { t } = useI18n()

const title = computed(() => t(`sourceControl.error.${props.issue?.kind ?? 'unknown'}.title`, { branch: props.issue?.branch ?? '' }))
const message = computed(() => t(`sourceControl.error.${props.issue?.kind ?? 'unknown'}.message`, { branch: props.issue?.branch ?? '' }))

async function copyDetails(): Promise<void> {
  if (!props.issue?.detail) return
  await navigator.clipboard.writeText(props.issue.detail)
}
</script>
