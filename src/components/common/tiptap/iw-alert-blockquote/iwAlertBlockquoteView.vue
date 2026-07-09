<template>
  <node-view-wrapper
    class="toolbar-wrapper iw-alert-blockquote-wrapper"
    :class="{ 'is-alert': !!alertType }"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <div
      v-show="shouldShowToolbar"
      class="toolbar-controls inside-top-right"
      contenteditable="false"
    >
      <select
        class="control-selector"
        :value="alertType ?? ''"
        :title="t('alertToolbar.type')"
        contenteditable="false"
        @change="handleTypeChange"
        @click.stop
      >
        <option value="">{{ t('alertToolbar.quoteBlock') }}</option>
        <option disabled value="__separator_quote__">—</option>
        <option v-for="option in githubAlertOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
        <option disabled value="__separator_iwriter__">—</option>
        <option v-for="option in iwriterAlertOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>

      <div class="control-group">
        <button
          v-if="alertType"
          class="control-button"
          :title="t('alertToolbar.convertToQuote')"
          contenteditable="false"
          @click.stop="unsetAlert"
        >
          <IconQuote class="control-button-icon" />
        </button>
        <button
          class="control-button delete-button"
          :title="t('alertToolbar.deleteBlock')"
          contenteditable="false"
          @click.stop="deleteBlock"
        >
          <IconTrash class="control-button-icon" />
        </button>
      </div>
    </div>

    <node-view-content
      as="blockquote"
      :class="alertClasses"
      :data-alert-type="alertType || undefined"
    />
  </node-view-wrapper>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { IconQuote, IconTrash } from '@tabler/icons-vue'
import { normalizeAlertType } from '@/utils/markdownAlerts'
import type { AlertTypeOption, IwAlertBlockquoteAttrs } from './types'

const props = defineProps(nodeViewProps)
const { t } = useI18n()
const isHovered = ref(false)

const githubAlertOptions: AlertTypeOption[] = [
  'NOTE',
  'TIP',
  'IMPORTANT',
  'WARNING',
  'CAUTION',
].map(value => ({ value, label: t(`alertToolbar.types.${value.toLowerCase()}`) }))

const iwriterAlertOptions: AlertTypeOption[] = [
  'BEAT',
  'COMMENT',
].map(value => ({ value, label: t(`alertToolbar.types.${value.toLowerCase()}`) }))

const attrs = computed(() => props.node.attrs as IwAlertBlockquoteAttrs)
const alertType = computed(() => normalizeAlertType(attrs.value.alertType))
const alertClasses = computed(() => alertType.value
  ? ['markdown-alert', `markdown-alert-${alertType.value.toLowerCase().replace(/_/g, '-')}`]
  : [])
const shouldShowToolbar = computed(() => props.editor.isEditable && (props.selected || isHovered.value))

function setAlertType(type: string): void {
  const normalized = normalizeAlertType(type)
  if (!normalized) return
  props.updateAttributes({ alertType: normalized })
}

function unsetAlert(): void {
  props.updateAttributes({ alertType: null })
}

function handleTypeChange(event: Event): void {
  const select = event.target as HTMLSelectElement
  const value = select.value

  if (!value) {
    unsetAlert()
    return
  }

  setAlertType(value)
}

function deleteBlock(): void {
  props.deleteNode()
}
</script>
