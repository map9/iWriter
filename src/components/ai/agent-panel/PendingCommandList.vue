<template>
  <div class="w-full max-h-36 overflow-y-auto rounded-box border border-base-300 bg-base-200 p-1 text-xs text-base-content shadow-sm">
    <div
      v-for="command in commands"
      :key="command.id"
      class="group flex h-7 items-center gap-1 overflow-hidden rounded px-1.5 whitespace-nowrap transition-colors hover:bg-base-300"
    >
      <IconChevronRight class="icon-2xs text-base-content/50" />
      <template v-if="editingId === command.id">
        <input
          :ref="setEditInputRef"
          v-model="editingText"
          class="input input-ghost input-xs h-6 min-h-0 min-w-0 flex-1 px-1 focus:outline-none"
          :aria-label="t('agentPanel.pendingCommands.edit')"
          @keydown.enter.prevent="saveEdit(command.id)"
          @keydown.esc.prevent="cancelEdit"
        />
        <button
          type="button"
          class="btn btn-ghost btn-square btn-xs h-6 min-h-0 w-6 shrink-0"
          :title="t('agentPanel.pendingCommands.save')"
          :disabled="!editingText.trim()"
          @click="saveEdit(command.id)"
        >
          <IconCheck class="icon-2xs" />
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-square btn-xs h-6 min-h-0 w-6 shrink-0"
          :title="t('agentPanel.pendingCommands.cancel')"
          @click="cancelEdit"
        >
          <IconX class="icon-2xs" />
        </button>
      </template>

      <template v-else>
        <span class="min-w-0 flex-1 truncate" :title="command.text">{{ command.text }}</span>
        <button
          type="button"
          class="btn btn-ghost btn-square btn-xs h-6 min-h-0 w-6 shrink-0"
          :title="t('agentPanel.pendingCommands.steer')"
          :disabled="steeringId !== null"
          @click="steer(command.id)"
        >
          <span v-if="steeringId === command.id" class="loading loading-spinner loading-xs" />
          <IconArrowForward v-else class="icon-2xs" />
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-square btn-xs h-6 min-h-0 w-6 shrink-0"
          :title="t('agentPanel.pendingCommands.edit')"
          :disabled="steeringId !== null"
          @click="startEdit(command)"
        >
          <IconPencil class="icon-2xs" />
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-square btn-xs h-6 min-h-0 w-6 shrink-0 text-error hover:bg-error hover:text-error-content"
          :title="t('agentPanel.pendingCommands.delete')"
          :disabled="steeringId !== null"
          @click="aiStore.removePendingCommand(command.id)"
        >
          <IconTrash class="icon-2xs" />
        </button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  IconChevronRight,
  IconCheck,
  IconPencil,
  IconArrowForward,
  IconTrash,
  IconX,
} from '@tabler/icons-vue'
import { useAiStore } from '@/ai/store/ai'
import type { PendingCommand } from '@/ai/store/modules/pendingCommands'

defineProps<{
  commands: PendingCommand[]
}>()

const aiStore = useAiStore()
const { t } = useI18n()
const editingId = ref<string | null>(null)
const editingText = ref('')
const editInputRef = ref<HTMLInputElement | null>(null)
const steeringId = ref<string | null>(null)

function setEditInputRef(element: unknown) {
  editInputRef.value = element instanceof HTMLInputElement ? element : null
}

function startEdit(command: PendingCommand) {
  editingId.value = command.id
  editingText.value = command.text
  nextTick(() => {
    editInputRef.value?.focus()
    editInputRef.value?.select()
  })
}

function saveEdit(id: string) {
  if (!aiStore.updatePendingCommand(id, editingText.value)) return
  cancelEdit()
}

function cancelEdit() {
  editingId.value = null
  editingText.value = ''
}

async function steer(id: string) {
  if (steeringId.value) return
  steeringId.value = id
  try {
    await aiStore.steerPendingCommand(id)
  } finally {
    steeringId.value = null
  }
}
</script>
