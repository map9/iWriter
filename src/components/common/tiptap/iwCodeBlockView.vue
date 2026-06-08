<template>
  <node-view-wrapper
    ref="codeBlockRef"
    class="toolbar-wrapper"
    :class="{
      editing: isMermaid && isEditing,
      'mermaid-edit-h': isMermaid && isEditing && mermaidLayout === 'horizontal',
      'mermaid-edit-v': isMermaid && isEditing && mermaidLayout === 'vertical',
    }"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <!-- 内部控制按钮：在代码块内部 -->
    <div
      class="toolbar-controls"
      :class="{
        'inside-top-right': !isMermaid || !isEditing,
        'outside-top-right': isMermaid && isEditing
      }"
      v-show="shouldShowToolbar"
    >
      <!-- Mermaid 编辑/预览切换按钮 -->
      <template v-if="isMermaid">
        <div class="control-group">
          <button
            v-show="isEditing"
            @click.stop="closeMermaidEdit"
            class="control-button confirm-button"
            title="Close Edit"
            contenteditable="false"
          >
            <IconCheck class="control-button-icon" />
          </button>
          <button
            v-show="!isEditing"
            @click.stop="openMermaidEdit"
            class="control-button"
            title="Edit Diagram"
            contenteditable="false"
          >
            <IconEdit class="control-button-icon" />
          </button>
          <!-- 布局切换：仅编辑态可见 -->
          <button
            v-show="isEditing"
            @click.stop="toggleMermaidLayout"
            class="control-button"
            :title="mermaidLayout === 'horizontal' ? 'Switch to vertical layout' : 'Switch to horizontal layout'"
            contenteditable="false"
          >
            <IconLayoutRows v-if="mermaidLayout === 'horizontal'" class="control-button-icon" />
            <IconLayoutColumns v-else class="control-button-icon" />
          </button>
          <button
            @click.stop="copyCode"
            class="control-button"
            title="Copy Source"
            contenteditable="false"
          >
            <IconCopy class="control-button-icon" />
          </button>
        </div>
        <!-- 缩放控制：编辑与预览态均可见 -->
        <div class="control-group">
          <button
            @click.stop="zoomOut"
            class="control-button"
            title="Zoom Out"
            contenteditable="false"
          >
            <IconZoomOut class="control-button-icon" />
          </button>
          <button
            @click.stop="resetZoom"
            class="control-button"
            title="Reset Zoom"
            contenteditable="false"
          >
            <IconZoomReset class="control-button-icon" />
          </button>
          <button
            @click.stop="zoomIn"
            class="control-button"
            title="Zoom In"
            contenteditable="false"
          >
            <IconZoomIn class="control-button-icon" />
          </button>
        </div>
        <button
          @click.stop="deleteCodeBlock"
          class="control-button delete-button"
          title="Delete Block"
          contenteditable="false"
        >
          <IconTrash class="control-button-icon" />
        </button>
      </template>

      <!-- 普通代码块控件 -->
      <template v-else>
        <!-- 语言选择器 -->
        <select
          contenteditable="false"
          v-model="selectedLanguage"
          class="control-selector"
          @click.stop
        >
          <option :value="null">auto</option>
          <option disabled>—</option>
          <option v-for="(language, index) in languages" :value="language" :key="index">
            {{ language }}
          </option>
        </select>

        <!-- 按钮组 -->
        <div class="control-group">
          <!-- 格式化按钮 -->
          <button
            @click.stop="formatCodeHandler"
            class="control-button"
            :class="{ disabled: !canFormat }"
            :disabled="!canFormat"
            :title="canFormat ? 'Format Code' : `Language '${selectedLanguage}' not supported for formatting`"
            contenteditable="false"
          >
            <IconCode class="control-button-icon" />
          </button>

          <!-- 复制按钮 -->
          <button
            @click.stop="copyCode"
            class="control-button"
            title="Copy Code"
            contenteditable="false"
          >
            <IconCopy class="control-button-icon" />
          </button>
        </div>

        <!-- 删除按钮 -->
        <button
          @click.stop="deleteCodeBlock"
          class="control-button delete-button"
          title="Delete Code Block"
          contenteditable="false"
        >
          <IconTrash class="control-button-icon" />
        </button>
      </template>
    </div>

    <!-- 代码内容区域（始终挂载，Mermaid 预览模式时隐藏） -->
    <pre v-show="!isMermaid || isEditing" class="mermaid-source"><node-view-content as="code"/></pre>

    <!-- Mermaid 渲染容器（Mermaid 模式时始终显示） -->
    <div
      v-if="isMermaid"
      ref="mermaidContainer"
      class="mermaid-container"
      :style="{ '--mermaid-zoom': mermaidZoom }"
      contenteditable="false"
    >
      <!-- 优先显示已渲染的 SVG，防止刷新闪烁 -->
      <div v-if="mermaidSvg" v-html="mermaidSvg" class="mermaid-svg-wrapper"></div>
      <div v-else-if="mermaidState === 'loading'" class="mermaid-placeholder">Rendering…</div>
      <div v-else-if="mermaidState === 'empty'" class="mermaid-placeholder mermaid-empty">Empty diagram — click edit to add source.</div>
      <div v-else-if="mermaidState === 'error'" class="mermaid-error">
        <span class="mermaid-error-label">Mermaid error:</span>
        <pre class="mermaid-error-text">{{ mermaidError }}</pre>
      </div>
    </div>
  </node-view-wrapper>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { NodeViewContent, nodeViewProps, NodeViewWrapper } from '@tiptap/vue-3'
import {
  IconTrash, IconCode, IconCopy, IconEdit, IconCheck,
  IconLayoutColumns, IconLayoutRows,
  IconZoomIn, IconZoomOut, IconZoomReset,
} from '@tabler/icons-vue'
import { formatCode, isLanguageSupported, type FormatResult } from "./utils/CodeFormatter"
import { renderMermaid, initMermaid } from "./utils/mermaidRenderer"
import { notify } from '@/utils/notifications'

interface NodeAttributes {
  language: string
}

const props = defineProps(nodeViewProps)

const isHovered = ref(false)
const isEditing = ref(false) // Mermaid 编辑模式

// Mermaid 布局与缩放
type MermaidLayout = 'horizontal' | 'vertical'
const mermaidLayout = ref<MermaidLayout>('horizontal')
const mermaidZoom = ref(1)

// Mermaid 渲染状态
type MermaidState = 'loading' | 'empty' | 'ok' | 'error'
const mermaidState = ref<MermaidState>('loading')
const mermaidSvg = ref('')
const mermaidError = ref('')
const mermaidContainer = ref<HTMLDivElement>()

// 防抖 timer
let renderTimer: ReturnType<typeof setTimeout> | null = null

// --- Computed ---
const languages = computed<string[]>(() => {
  try {
    const languages = props.extension.options.lowlight.listLanguages()
    const language = (props.node.attrs as NodeAttributes).language

    const allLanguages = [...languages]
    if (language && !languages.includes(language)) {
      allLanguages.push(language)
    }

    return allLanguages
      .filter((lang: string) => {
        const excluded = ['1c', 'abnf', 'accesslog', 'actionscript', 'ada']
        return !excluded.includes(lang)
      })
      .sort()
  } catch (error) {
    notify.error(`${error instanceof Error ? error.message : String(error)}`, '代码块扩展错误')
    return []
  }
})

const selectedLanguage = computed({
  get(): string | null {
    return (props.node.attrs as NodeAttributes).language || null
  },
  set(language: string) {
    props.updateAttributes({ language })
  },
})

const isMermaid = computed(() => selectedLanguage.value === 'mermaid')

const shouldShowToolbar = computed((): boolean => {
  return props.selected || isHovered.value || isEditing.value
})

const canFormat = computed((): boolean => {
  return isLanguageSupported(selectedLanguage.value)
})

// --- Mermaid rendering ---
function scheduleRender(): void {
  if (!isMermaid.value) return
  if (renderTimer) clearTimeout(renderTimer)
  // 仅在尚无 SVG 时才显示 loading 占位，避免刷新闪烁
  if (!mermaidSvg.value) {
    mermaidState.value = 'loading'
  }
  renderTimer = setTimeout(() => {
    doRender()
  }, 300)
}

async function doRender(): Promise<void> {
  const code = props.node.textContent ?? ''
  if (!code.trim()) {
    mermaidState.value = 'empty'
    mermaidSvg.value = ''
    mermaidError.value = ''
    return
  }
  const result = await renderMermaid(code)
  if ('svg' in result) {
    // 渲染成功：原子替换 SVG，不经过空白状态
    mermaidSvg.value = result.svg
    mermaidError.value = ''
    mermaidState.value = 'ok'
  } else {
    mermaidError.value = result.error
    // 若已有旧图则保留，不闪烁到 error 状态；仅首次无图时才显示错误
    if (!mermaidSvg.value) {
      mermaidState.value = result.error ? 'error' : 'empty'
    }
  }
}

// Watch node text content changes
watch(
  () => props.node.textContent,
  () => { if (isMermaid.value) scheduleRender() }
)

// Watch language change (e.g. user switches to/from mermaid via language selector)
watch(isMermaid, (val) => {
  if (val) scheduleRender()
})

// Watch theme changes via data-theme attribute on documentElement
let themeObserver: MutationObserver | null = null

function setupThemeObserver(): void {
  themeObserver = new MutationObserver(() => {
    if (isMermaid.value) {
      initMermaid() // force re-init with new theme
      scheduleRender()
    }
  })
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
}

// --- Mermaid layout & zoom ---
function toggleMermaidLayout(): void {
  mermaidLayout.value = mermaidLayout.value === 'horizontal' ? 'vertical' : 'horizontal'
}

function zoomIn(): void {
  mermaidZoom.value = Math.min(3, +(mermaidZoom.value * 1.2).toFixed(3))
}

function zoomOut(): void {
  mermaidZoom.value = Math.max(0.3, +(mermaidZoom.value / 1.2).toFixed(3))
}

function resetZoom(): void {
  mermaidZoom.value = 1
}

// --- Mermaid edit mode ---
function openMermaidEdit(): void {
  isEditing.value = true
}

function closeMermaidEdit(): void {
  isEditing.value = false
  // re-render immediately on close
  doRender()
}

// Click outside closes edit
const codeBlockRef = ref()

function handleClickOutside(event: MouseEvent): void {
  if (!isMermaid.value || !isEditing.value || !codeBlockRef.value) return
  const target = event.target as Element
  const domElement = codeBlockRef.value.$el || codeBlockRef.value
  if (!domElement?.contains(target)) {
    closeMermaidEdit()
  }
}

// --- Event handlers (shared) ---
function handleMouseEnter(): void {
  isHovered.value = true
}

function handleMouseLeave(): void {
  isHovered.value = false
}

const copyCode = async (): Promise<void> => {
  const codeContent: string = props.node.textContent || ''
  if (!codeContent.trim()) return
  try {
    await navigator.clipboard.writeText(codeContent)
  } catch (error) {
    notify.error(`${error instanceof Error ? error.message : String(error)}`, '代码拷贝错误')
  }
}

const formatCodeHandler = async (): Promise<void> => {
  if (!canFormat.value) return

  const currentContent: string = props.node.textContent || ''
  if (!currentContent.trim()) return

  try {
    const result: FormatResult = await formatCode(currentContent, selectedLanguage.value)

    if (result.success && result.formattedCode) {
      props.editor
        .chain()
        .focus()
        .setNodeSelection(props.getPos()!)
        .insertContent({
          type: 'codeBlock',
          attrs: {
            language: selectedLanguage.value
          },
          content: [{
            type: 'text',
            text: result.formattedCode
          }]
        })
        .run()

      const pos = props.getPos()!
      props.editor
        .chain()
        .setTextSelection(pos + 1)
        .run()
    }
  } catch (error) {
    notify.error(`${error instanceof Error ? error.message : String(error)}`, '代码格式化错误')
  }
}

const deleteCodeBlock = (): void => {
  if (props.deleteNode) {
    props.deleteNode()
  }
}

// --- Lifecycle ---
onMounted(() => {
  if (isMermaid.value) {
    initMermaid()
    doRender()
  }
  setupThemeObserver()
  document.addEventListener('click', handleClickOutside, true)
})

onUnmounted(() => {
  if (renderTimer) clearTimeout(renderTimer)
  themeObserver?.disconnect()
  document.removeEventListener('click', handleClickOutside, true)
})
</script>

<style lang="scss" scoped>
// ── 左右分栏（默认） ──────────────────────────────────────────────
.toolbar-wrapper.mermaid-edit-h {
  display: flex;
  flex-direction: row;
  height: 384px; // h-96

  > pre.mermaid-source {
    flex: 0 0 256px; // w-48
    width: 256px;
    height: 100%;
    overflow: auto;
    margin: 0;
    border-radius: 0;
    border-right: var(--border) solid var(--color-base-300);
  }

  > .mermaid-container {
    flex: 1;
    min-width: 0;
    height: 100%;
    overflow: auto;
    min-height: unset;
    align-items: flex-start;
  }
}

// ── 上下分栏 ──────────────────────────────────────────────────────
.toolbar-wrapper.mermaid-edit-v {
  display: flex;
  flex-direction: column;

  > pre.mermaid-source {
    max-height: 256px; // h-48
    overflow: auto;
    margin: 0;
    border-radius: 0;
    border-bottom: var(--border) solid var(--color-base-300);
  }

  > .mermaid-container {
    height: 384px; // h-96
    overflow: auto;
    min-height: unset;
    align-items: flex-start;
  }
}

// ── Mermaid 渲染容器（通用） ──────────────────────────────────────
.mermaid-container {
  padding: 12px 16px;
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;

  .mermaid-placeholder {
    font-size: 13px;
    color: color-mix(in oklab, var(--color-base-content) 45%, transparent);
    font-style: italic;
  }

  .mermaid-empty {
    cursor: default;
  }

  .mermaid-error {
    width: 100%;
    font-size: 12px;
    color: var(--color-error);

    .mermaid-error-label {
      font-weight: 600;
      margin-right: 4px;
    }

    .mermaid-error-text {
      margin-top: 4px;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: var(--font-mono);
      font-size: 11px;
      opacity: 0.85;
    }
  }

  .mermaid-svg-wrapper {
    width: 100%;
    display: flex;
    justify-content: center;
    // 缩放：使用 zoom 属性使布局尺寸随比例变化，overflow 可正确滚动
    zoom: var(--mermaid-zoom, 1);

    :deep(svg) {
      max-width: 100%;
      height: auto;
    }
  }
}
</style>
