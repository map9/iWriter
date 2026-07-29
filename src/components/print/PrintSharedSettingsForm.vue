<template>
  <div class="@container flex min-h-0 flex-1 flex-col overflow-y-auto" :class="containerClass">
    <section class="flex flex-col gap-5">
      <h3 v-if="showSectionTitles" class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.print.themeGroup') }}</h3>

      <label class="flex items-center gap-3">
        <input
          v-model="settings.themeAssignment.printUsesScreenTheme"
          type="checkbox"
          class="checkbox checkbox-sm checkbox-primary"
        />
        <span class="text-sm">{{ t('preferences.print.printUsesScreenTheme') }}</span>
      </label>

      <div v-if="!settings.themeAssignment.printUsesScreenTheme" class="responsive-inline-row">
        <label class="text-sm font-medium text-base-content">{{ t('preferences.print.printTheme') }}</label>
        <select
          v-model="settings.themeAssignment.printThemeId"
          class="select select-sm w-full"
        >
          <option v-for="theme in themes" :key="theme.id" :value="theme.id">{{ theme.name }}</option>
        </select>
      </div>
    </section>

    <section class="flex flex-col gap-5" :class="sectionGapClass">
      <h3 v-if="showSectionTitles" class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.print.pageGroup') }}</h3>

      <div class="responsive-two-col-grid">
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-base-content">{{ t('dialog.printDialog.paperSize.label') }}</label>
          <select v-model="settings.pageSetup.size" class="select select-sm">
            <option v-for="size in paperSizes" :key="size.value" :value="size.value">{{ size.label }}</option>
          </select>
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-base-content">{{ t('dialog.printDialog.orientation.label') }}</label>
          <select v-model="settings.pageSetup.orientation" class="select select-sm">
            <option value="portrait">{{ t('dialog.printDialog.orientation.options.portrait') }}</option>
            <option value="landscape">{{ t('dialog.printDialog.orientation.options.landscape') }}</option>
          </select>
        </div>
      </div>

      <div class="responsive-inline-row">
        <label class="text-sm font-medium text-base-content">{{ t('preferences.print.pageStartSide') }}</label>
        <select v-model="settings.pageSetup.pageSideStart" class="select select-sm w-full">
          <option value="auto">{{ t('preferences.print.pageStartAuto') }}</option>
          <option value="recto">{{ pageSideStartRectoLabel }}</option>
          <option value="verso">{{ pageSideStartVersoLabel }}</option>
        </select>
      </div>

      <div class="responsive-inline-row">
        <label class="text-sm font-medium text-base-content">{{ t('preferences.print.marginMode') }}</label>
        <select v-model="settings.pageSetup.marginMode" class="select select-sm w-full" @change="normalizeMarginMode(settings.pageSetup.marginMode)">
          <option value="single">{{ t('preferences.print.marginModeSingle') }}</option>
          <option value="facing">{{ t('preferences.print.marginModeFacing') }}</option>
        </select>
      </div>

      <div v-if="settings.pageSetup.marginMode === 'single'" class="responsive-two-col-grid">
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-base-content">{{ t('preferences.print.marginTop') }}</label>
          <input v-model="singleMargins.top" type="text" class="input input-sm h-7 w-full" />
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-base-content">{{ t('preferences.print.marginRight') }}</label>
          <input v-model="singleMargins.right" type="text" class="input input-sm h-7 w-full" />
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-base-content">{{ t('preferences.print.marginBottom') }}</label>
          <input v-model="singleMargins.bottom" type="text" class="input input-sm h-7 w-full" />
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-base-content">{{ t('preferences.print.marginLeft') }}</label>
          <input v-model="singleMargins.left" type="text" class="input input-sm h-7 w-full" />
        </div>
      </div>

      <div v-else class="responsive-two-col-grid">
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-base-content">{{ t('preferences.print.marginTop') }}</label>
          <input v-model="facingMargins.top" type="text" class="input input-sm h-7 w-full" />
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-base-content">{{ t('preferences.print.marginBottom') }}</label>
          <input v-model="facingMargins.bottom" type="text" class="input input-sm h-7 w-full" />
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-base-content">{{ t('preferences.print.marginInside') }}</label>
          <input v-model="facingMargins.inside" type="text" class="input input-sm h-7 w-full" />
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-base-content">{{ t('preferences.print.marginOutside') }}</label>
          <input v-model="facingMargins.outside" type="text" class="input input-sm h-7 w-full" />
        </div>
      </div>

      <label class="flex items-center gap-3">
        <input v-model="settings.pageSetup.background" type="checkbox" class="checkbox checkbox-sm checkbox-primary" />
        <span class="text-sm">{{ t('dialog.printDialog.options.printBackground') }}</span>
      </label>
    </section>

    <section class="flex flex-col gap-5" :class="sectionGapClass">
      <h3 v-if="showSectionTitles" class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.print.paginationGroup') }}</h3>

      <div class="responsive-inline-row">
        <label class="text-sm font-medium text-base-content">{{ t('preferences.print.chapterStartSide') }}</label>
        <select v-model="settings.pagination.chapterStartSide" class="select select-sm w-full">
          <option value="auto">{{ t('preferences.print.pageStartAuto') }}</option>
          <option value="recto">{{ pageSideStartRectoLabel }}</option>
          <option value="verso">{{ pageSideStartVersoLabel }}</option>
        </select>
      </div>

      <div class="responsive-inline-row">
        <label class="text-sm font-medium text-base-content">{{ t('preferences.print.paginationMode') }}</label>
        <select v-model="settings.pagination.mode" class="select select-sm w-full">
          <option value="balanced">{{ t('preferences.print.paginationBalanced') }}</option>
          <option value="compact">{{ t('preferences.print.paginationCompact') }}</option>
          <option value="strict-book">{{ t('preferences.print.paginationStrictBook') }}</option>
          <option value="custom">{{ t('preferences.print.paginationCustom') }}</option>
        </select>
      </div>

      <div class="rounded-box border border-base-300 bg-base-100 p-3">
        <div class="mb-2 flex items-center justify-between text-sm font-medium text-base-content">{{ t('preferences.print.keepWithNext') }}</div>
        <div class="responsive-option-grid">
          <label class="responsive-option-item">
            <input v-model="settings.pagination.keepWithNext.headings" type="checkbox" class="checkbox checkbox-sm checkbox-primary" />
            <span class="text-sm">{{ t('preferences.print.keepWithNextHeadings') }}</span>
          </label>
          <label class="responsive-option-item">
            <input v-model="settings.pagination.keepWithNext.figureCaption" type="checkbox" class="checkbox checkbox-sm checkbox-primary" />
            <span class="text-sm">{{ t('preferences.print.keepWithNextFigureCaption') }}</span>
          </label>
          <label class="responsive-option-item">
            <input v-model="settings.pagination.keepWithNext.tableCaption" type="checkbox" class="checkbox checkbox-sm checkbox-primary" />
            <span class="text-sm">{{ t('preferences.print.keepWithNextTableCaption') }}</span>
          </label>
        </div>
      </div>

      <div class="rounded-box border border-base-300 bg-base-100 p-3">
        <div class="mb-2 flex items-center justify-between text-sm font-medium text-base-content">{{ t('preferences.print.avoidBreak') }}</div>
        <div class="responsive-option-grid">
          <label class="responsive-option-item">
            <input v-model="settings.pagination.avoidBreakInside.paragraph" type="checkbox" class="checkbox checkbox-sm checkbox-primary" />
            <span class="text-sm">{{ t('preferences.print.avoidBreakParagraph') }}</span>
          </label>
          <label class="responsive-option-item">
            <input v-model="settings.pagination.avoidBreakInside.blockquote" type="checkbox" class="checkbox checkbox-sm checkbox-primary" />
            <span class="text-sm">{{ t('preferences.print.avoidBreakBlockquote') }}</span>
          </label>
          <label class="responsive-option-item">
            <input v-model="settings.pagination.avoidBreakInside.codeBlock" type="checkbox" class="checkbox checkbox-sm checkbox-primary" />
            <span class="text-sm">{{ t('preferences.print.avoidBreakCodeBlock') }}</span>
          </label>
          <label class="responsive-option-item">
            <input v-model="settings.pagination.avoidBreakInside.table" type="checkbox" class="checkbox checkbox-sm checkbox-primary" />
            <span class="text-sm">{{ t('preferences.print.avoidBreakTable') }}</span>
          </label>
          <label class="responsive-option-item">
            <input v-model="settings.pagination.avoidBreakInside.tableRow" type="checkbox" class="checkbox checkbox-sm checkbox-primary" />
            <span class="text-sm">{{ t('preferences.print.avoidBreakTableRow') }}</span>
          </label>
          <label class="responsive-option-item">
            <input v-model="settings.pagination.avoidBreakInside.image" type="checkbox" class="checkbox checkbox-sm checkbox-primary" />
            <span class="text-sm">{{ t('preferences.print.avoidBreakImage') }}</span>
          </label>
          <label class="responsive-option-item">
            <input v-model="settings.pagination.avoidBreakInside.listItem" type="checkbox" class="checkbox checkbox-sm checkbox-primary" />
            <span class="text-sm">{{ t('preferences.print.avoidBreakListItem') }}</span>
          </label>
        </div>
      </div>

      <label class="responsive-option-item">
        <input v-model="settings.pagination.repeatTableHeader" type="checkbox" class="checkbox checkbox-sm checkbox-primary" />
        <span class="text-sm">{{ t('preferences.print.repeatTableHeader') }}</span>
      </label>

      <div class="responsive-two-col-grid">
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-base-content">{{ t('preferences.print.widows') }}</label>
          <input
            type="number"
            min="0"
            max="20"
            class="input input-sm h-7 w-full"
            :value="settings.pagination.widows ?? ''"
            :placeholder="t('preferences.print.widowsPlaceholder')"
            @input="onWidowsInput(($event.target as HTMLInputElement).value)"
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-base-content">{{ t('preferences.print.orphans') }}</label>
          <input
            type="number"
            min="0"
            max="20"
            class="input input-sm h-7 w-full"
            :value="settings.pagination.orphans ?? ''"
            :placeholder="t('preferences.print.widowsPlaceholder')"
            @input="onOrphansInput(($event.target as HTMLInputElement).value)"
          />
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <label class="text-sm font-medium text-base-content">{{ t('preferences.print.blankPageBehavior') }}</label>
        <select v-model="settings.pagination.blankPageBehavior" class="select select-sm">
          <option value="allow">{{ t('preferences.print.blankPageAllow') }}</option>
          <option value="suppress-header-footer">{{ t('preferences.print.blankPageSuppressHeaderFooter') }}</option>
        </select>
      </div>
    </section>

    <section class="flex flex-col gap-5" :class="sectionGapClass">
      <h3 v-if="showSectionTitles" class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.print.headerFooterGroup') }}</h3>

      <label class="responsive-option-item">
        <input v-model="settings.headerFooter.enabled" type="checkbox" class="checkbox checkbox-sm checkbox-primary" />
        <span class="text-sm">{{ t('preferences.print.headerFooterEnabled') }}</span>
      </label>

      <template v-if="settings.headerFooter.enabled">
        <div class="responsive-option-grid">
          <label class="responsive-option-item">
            <input v-model="settings.headerFooter.differentFirstPage" type="checkbox" class="checkbox checkbox-sm checkbox-primary" />
            <span class="text-sm">{{ t('preferences.print.differentFirstPage') }}</span>
          </label>
          <label class="responsive-option-item">
            <input v-model="settings.headerFooter.differentLeftRight" type="checkbox" class="checkbox checkbox-sm checkbox-primary" />
            <span class="text-sm">{{ t('preferences.print.differentLeftRight') }}</span>
          </label>
        </div>

        <div
          v-for="group in availableSlotGroups"
          :key="group.key"
          class="rounded-box border border-base-300 bg-base-100 p-3"
        >
          <div class="mb-2 flex items-center justify-between gap-2">
            <div class="text-sm font-medium text-base-content">{{ group.label }}</div>
            <button
              type="button"
              class="btn btn-xs btn-ghost gap-1"
              :disabled="getRemainingSlots(group.key).length === 0"
              :title="t('preferences.print.addMarginBox')"
              @click="addSlot(group.key)"
            >
              <IconPlus class="icon-2xs" />
              <span>{{ t('preferences.print.addMarginBox') }}</span>
            </button>
          </div>

          <div
            v-if="getActiveSlots(group.key).length === 0"
            class="rounded-box border border-dashed border-base-300 px-3 py-3 text-center text-xs text-base-content/50"
          >
            {{ t('preferences.print.marginBoxEmptyTip') }}
          </div>

          <div v-else class="flex flex-col gap-1.5">
            <div
              v-for="slot in getActiveSlots(group.key)"
              :key="slot"
              class="slot-row"
            >
              <select
                :value="slot"
                class="select select-sm slot-select px-2"
                @change="renameSlot(group.key, slot, ($event.target as HTMLSelectElement).value as MarginBoxSlot)"
              >
                <option v-for="option in getSlotOptions(group.key, slot)" :key="option" :value="option">
                  {{ option }}
                </option>
              </select>
              <input
                :value="getSlotTemplate(group.key, slot)"
                type="text"
                class="input input-sm h-7 w-full slot-input text-sm"
                :placeholder="t('preferences.print.slotTemplatePlaceholder')"
                @input="setSlotTemplate(group.key, slot, ($event.target as HTMLInputElement).value)"
              />
              <div class="dropdown dropdown-end slot-preset">
                <div
                  tabindex="0"
                  role="button"
                  class="btn btn-ghost btn-square btn-xs"
                  :aria-label="t('preferences.print.slotPresetButton')"
                >
                  <IconDots class="icon-xs" />
                </div>
                <ul
                  tabindex="0"
                  class="menu dropdown-content z-20 mt-1 w-64 rounded-box border border-base-300 bg-base-100 p-2 shadow-lg"
                >
                  <li v-for="preset in slotTemplatePresets" :key="preset.value">
                    <button type="button" @click="applyPresetAndClose(group.key, slot, preset.value, $event)">
                      {{ preset.label }}
                    </button>
                  </li>
                </ul>
              </div>
              <button
                type="button"
                class="btn btn-ghost btn-square btn-xs slot-trash text-error"
                :title="t('preferences.print.removeMarginBox')"
                @click="removeSlot(group.key, slot)"
              >
                <IconTrash class="icon-xs" />
              </button>
            </div>
          </div>

          <p v-if="group.key === 'slots'" class="mt-2 text-xs text-base-content/50">
            {{ slotTemplateHelpText }}
          </p>
          <p
            v-if="group.key === 'slots' && (settings.headerFooter.differentFirstPage || settings.headerFooter.differentLeftRight)"
            class="mt-1 text-xs text-base-content/50"
          >
            {{ t('preferences.print.marginBoxesCascadeHint') }}
          </p>
        </div>

        <div class="responsive-two-col-grid">
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-base-content">{{ t('preferences.print.chapterSource') }}</label>
            <select v-model="settings.runningTitle.chapterSource" class="select select-sm">
              <option value="none">None</option>
              <option value="h1">H1</option>
              <option value="h2">H2</option>
            </select>
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-base-content">{{ t('preferences.print.sectionSource') }}</label>
            <select v-model="settings.runningTitle.sectionSource" class="select select-sm">
              <option value="none">None</option>
              <option value="h2">H2</option>
              <option value="h3">H3</option>
            </select>
          </div>
        </div>
      </template>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { IconDots, IconPlus, IconTrash } from '@tabler/icons-vue'
import {
  applyPaginationModePreset,
  getAllMarkdownThemes,
  createFacingMargins,
  createSingleMargins,
} from '@/components/print/markdownThemes'
import type { MarginBoxContent, MarginBoxSlot, PaginationModePreset, ResolvedMarkdownPrintSettings } from '@/types'

const ALL_MARGIN_BOX_SLOTS: readonly MarginBoxSlot[] = [
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
  'left-top',
  'left-middle',
  'left-bottom',
  'right-top',
  'right-middle',
  'right-bottom',
  'top-left-corner',
  'top-right-corner',
  'bottom-left-corner',
  'bottom-right-corner',
]

interface PaperSizeOption {
  value: string
  label: string
}

const props = withDefaults(defineProps<{
  settings: ResolvedMarkdownPrintSettings
  paperSizes: PaperSizeOption[]
  containerClass?: string
  sectionGapClass?: string
  showSectionTitles?: boolean
}>(), {
  containerClass: '',
  sectionGapClass: 'mt-8',
  showSectionTitles: true,
})

const { t } = useI18n()
const themes = computed(() => getAllMarkdownThemes())
const settings = props.settings
const isFacingMargins = computed(() => settings.pageSetup.marginMode === 'facing')
const pageSideStartRectoLabel = computed(() =>
  isFacingMargins.value
    ? t('preferences.print.pageStartRectoFacing')
    : t('preferences.print.pageStartRectoSingle'),
)
const pageSideStartVersoLabel = computed(() =>
  isFacingMargins.value
    ? t('preferences.print.pageStartVersoFacing')
    : t('preferences.print.pageStartVersoSingle'),
)

function onWidowsInput(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) {
    settings.pagination.widows = null
    return
  }
  const n = Number(trimmed)
  if (Number.isFinite(n) && n >= 0) settings.pagination.widows = Math.floor(n)
}

function onOrphansInput(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) {
    settings.pagination.orphans = null
    return
  }
  const n = Number(trimmed)
  if (Number.isFinite(n) && n >= 0) settings.pagination.orphans = Math.floor(n)
}
const TEMPLATE_VARIABLE_NAMES = ['documentTitle', 'chapterTitle', 'sectionTitle', 'printDate', 'pageNo', 'totalPages']
const slotTemplateHelpText = computed(() =>
  t('preferences.print.slotTemplateHelp', {
    vars: TEMPLATE_VARIABLE_NAMES.map(name => '$' + '{' + name + '}').join(', '),
  }),
)
const slotTemplatePresets = computed(() => [
  { label: t('preferences.print.slotPresetNone'), value: '' },
  { label: '$' + '{documentTitle}', value: '$' + '{documentTitle}' },
  { label: '$' + '{chapterTitle}', value: '$' + '{chapterTitle}' },
  { label: '$' + '{sectionTitle}', value: '$' + '{sectionTitle}' },
  { label: '$' + '{printDate}', value: '$' + '{printDate}' },
  { label: `Page ${'$' + '{pageNo}'}`, value: `Page ${'$' + '{pageNo}'}` },
  { label: `Page ${'$' + '{pageNo}'} of ${'$' + '{totalPages}'}`, value: `Page ${'$' + '{pageNo}'} of ${'$' + '{totalPages}'}` },
  { label: `${'$' + '{documentTitle}'} · ${'$' + '{pageNo}'}`, value: `${'$' + '{documentTitle}'} · ${'$' + '{pageNo}'}` },
  { label: `${'$' + '{chapterTitle}'} · ${'$' + '{pageNo}'}`, value: `${'$' + '{chapterTitle}'} · ${'$' + '{pageNo}'}` },
])

const singleMargins = computed({
  get() {
    return 'left' in settings.pageSetup.margins
      ? settings.pageSetup.margins as ReturnType<typeof createSingleMargins>
      : createSingleMargins()
  },
  set(value: ReturnType<typeof createSingleMargins>) {
    settings.pageSetup.marginMode = 'single'
    settings.pageSetup.margins = value
  },
})

const facingMargins = computed({
  get() {
    return 'inside' in settings.pageSetup.margins
      ? settings.pageSetup.margins as ReturnType<typeof createFacingMargins>
      : createFacingMargins()
  },
  set(value: ReturnType<typeof createFacingMargins>) {
    settings.pageSetup.marginMode = 'facing'
    settings.pageSetup.margins = value
  },
})

function normalizeMarginMode(mode: 'single' | 'facing') {
  if (mode === 'facing') {
    if ('inside' in settings.pageSetup.margins) return
    const current = 'left' in settings.pageSetup.margins ? settings.pageSetup.margins : createSingleMargins()
    settings.pageSetup.margins = createFacingMargins(current.top, current.bottom, current.left, current.right)
    return
  }

  if ('left' in settings.pageSetup.margins) return
  const current = 'inside' in settings.pageSetup.margins ? settings.pageSetup.margins : createFacingMargins()
  settings.pageSetup.margins = createSingleMargins(current.top, current.outside, current.bottom, current.inside)
}

type SlotGroupKey = 'slots' | 'firstPageSlots' | 'leftPageSlots' | 'rightPageSlots'

function getSlotContainer(
  group: SlotGroupKey,
  createIfMissing = false,
): Partial<Record<MarginBoxSlot, MarginBoxContent>> {
  if (group === 'slots') return settings.headerFooter.slots
  if (group === 'firstPageSlots') {
    if (createIfMissing) settings.headerFooter.firstPageSlots ??= {}
    return settings.headerFooter.firstPageSlots ?? {}
  }
  if (group === 'leftPageSlots') {
    if (createIfMissing) settings.headerFooter.leftPageSlots ??= {}
    return settings.headerFooter.leftPageSlots ?? {}
  }
  if (createIfMissing) settings.headerFooter.rightPageSlots ??= {}
  return settings.headerFooter.rightPageSlots ?? {}
}

function getSlotTemplate(group: SlotGroupKey, slot: MarginBoxSlot): string {
  return getSlotContainer(group)[slot]?.template ?? ''
}

function setSlotTemplate(group: SlotGroupKey, slot: MarginBoxSlot, value: string) {
  const container = getSlotContainer(group, true)
  container[slot] = {
    ...(container[slot] ?? {}),
    template: value,
  }
}

function applyPresetAndClose(group: SlotGroupKey, slot: MarginBoxSlot, value: string, e: MouseEvent) {
  setSlotTemplate(group, slot, value)
  const target = e.currentTarget as HTMLElement | null
  target?.blur()
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur()
  }
}

const availableSlotGroups = computed<readonly { key: SlotGroupKey, label: string }[]>(() => {
  const groups: { key: SlotGroupKey, label: string }[] = [
    { key: 'slots', label: t('preferences.print.marginBoxes') },
  ]
  if (settings.headerFooter.differentFirstPage) {
    groups.push({ key: 'firstPageSlots', label: t('preferences.print.firstPageMarginBoxes') })
  }
  if (settings.headerFooter.differentLeftRight) {
    groups.push({ key: 'leftPageSlots', label: t('preferences.print.leftPageMarginBoxes') })
    groups.push({ key: 'rightPageSlots', label: t('preferences.print.rightPageMarginBoxes') })
  }
  return groups
})

function getActiveSlots(group: SlotGroupKey): MarginBoxSlot[] {
  const container = getSlotContainer(group)
  return ALL_MARGIN_BOX_SLOTS.filter(slot => slot in container)
}

function getRemainingSlots(group: SlotGroupKey): MarginBoxSlot[] {
  const container = getSlotContainer(group)
  return ALL_MARGIN_BOX_SLOTS.filter(slot => !(slot in container))
}

function getSlotOptions(group: SlotGroupKey, current: MarginBoxSlot): MarginBoxSlot[] {
  const container = getSlotContainer(group)
  return ALL_MARGIN_BOX_SLOTS.filter(slot => slot === current || !(slot in container))
}

function addSlot(group: SlotGroupKey) {
  const remaining = getRemainingSlots(group)
  if (remaining.length === 0) return
  const next = remaining[0]!
  const container = getSlotContainer(group, true)
  container[next] = { template: '' }
}

function removeSlot(group: SlotGroupKey, slot: MarginBoxSlot) {
  const container = getSlotContainer(group, true)
  delete container[slot]
}

function renameSlot(group: SlotGroupKey, oldSlot: MarginBoxSlot, newSlot: MarginBoxSlot) {
  if (oldSlot === newSlot) return
  const container = getSlotContainer(group, true)
  if (newSlot in container) return
  container[newSlot] = { ...(container[oldSlot] ?? { template: '' }) }
  delete container[oldSlot]
}

watch(() => settings.pageSetup.marginMode, (mode) => {
  normalizeMarginMode(mode)
}, { immediate: true })

// Pagination mode <-> sub-fields coupling.
//   - User picks a non-`custom` mode: replay that preset onto sub-fields.
//   - User edits any sub-field: flip mode to `'custom'`.
// `suppressModeCoupling` breaks the otherwise-circular trigger between the two
// watchers; we reset it on the next tick so any queued PRE-flush re-runs from
// the just-applied mutations see the guard before it lifts.
let suppressModeCoupling = false

function clearModeCouplingGuard() {
  void nextTick(() => {
    suppressModeCoupling = false
  })
}

watch(
  () => settings.pagination.mode,
  (mode) => {
    if (suppressModeCoupling) return
    if (mode === 'custom') return
    suppressModeCoupling = true
    applyPaginationModePreset(settings.pagination, mode as PaginationModePreset)
    clearModeCouplingGuard()
  },
)

watch(
  () => [
    settings.pagination.keepWithNext.headings,
    settings.pagination.keepWithNext.figureCaption,
    settings.pagination.keepWithNext.tableCaption,
    settings.pagination.avoidBreakInside.paragraph,
    settings.pagination.avoidBreakInside.blockquote,
    settings.pagination.avoidBreakInside.codeBlock,
    settings.pagination.avoidBreakInside.table,
    settings.pagination.avoidBreakInside.tableRow,
    settings.pagination.avoidBreakInside.image,
    settings.pagination.avoidBreakInside.listItem,
    settings.pagination.widows,
    settings.pagination.orphans,
    settings.pagination.chapterStartSide,
    settings.pagination.blankPageBehavior,
    settings.pagination.repeatTableHeader,
  ],
  () => {
    if (suppressModeCoupling) return
    if (settings.pagination.mode === 'custom') return
    suppressModeCoupling = true
    settings.pagination.mode = 'custom'
    clearModeCouplingGuard()
  },
)
</script>

<style scoped>
.responsive-inline-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.375rem;
}

.responsive-two-col-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1rem;
}

.responsive-option-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.75rem;
}

.responsive-option-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.responsive-option-item span {
  white-space: nowrap;
}

.slot-row {
  display: grid;
  grid-template-areas:
    "select trash"
    "input  preset";
  grid-template-columns: minmax(0, 1fr) auto;
  column-gap: 0.375rem;
  row-gap: 0.375rem;
  align-items: center;
}

.slot-row .slot-select {
  grid-area: select;
  min-width: 0;
}

.slot-row .slot-input {
  grid-area: input;
  min-width: 0;
}

.slot-row .slot-preset {
  grid-area: preset;
  justify-self: end;
}

.slot-row .slot-trash {
  grid-area: trash;
  justify-self: end;
}

@container (min-width: 28rem) {
  .responsive-inline-row {
    align-items: center;
    gap: 1rem;
  }

  .responsive-inline-row,
  .responsive-two-col-grid,
  .responsive-option-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .slot-row {
    grid-template-areas: "select input preset trash";
    grid-template-columns: 9rem minmax(0, 1fr) auto auto;
  }
}
</style>
