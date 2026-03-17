<template>
  <Transition name="fade">
    <div
      v-if="aiStore.acpPermissionPending"
      class="absolute inset-0 z-30 flex items-end justify-center pb-4 px-3 bg-black/20"
    >
      <div class="w-full bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
        <div class="flex items-center gap-2 px-4 py-3 bg-amber-50 border-b border-amber-200">
          <span class="text-amber-600 text-base">🔐</span>
          <span class="text-sm font-semibold text-amber-800">Agent 请求权限</span>
        </div>

        <div class="px-4 py-3 space-y-1.5">
          <p class="text-xs font-medium text-gray-700">
            操作：<span class="font-mono text-amber-700">{{ aiStore.acpPermissionPending.permission }}</span>
          </p>
          <p v-if="aiStore.acpPermissionPending.path" class="text-xs font-mono text-gray-500 bg-gray-50 px-2 py-1 rounded truncate">
            {{ aiStore.acpPermissionPending.path }}
          </p>
          <p v-if="aiStore.acpPermissionPending.description" class="text-xs text-gray-600">
            {{ aiStore.acpPermissionPending.description }}
          </p>
        </div>

        <div class="flex items-center gap-2 px-4 pb-3 pt-1">
          <button
            @click="aiStore.resolveAcpPermission('deny')"
            class="flex-1 px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            拒绝
          </button>
          <button
            @click="aiStore.resolveAcpPermission('allow_once')"
            class="flex-1 px-3 py-1.5 text-xs text-white bg-primary-500 rounded-lg hover:bg-primary-600 transition-colors"
          >
            允许一次
          </button>
          <button
            @click="aiStore.resolveAcpPermission('allow_always')"
            class="flex-1 px-3 py-1.5 text-xs text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
          >
            始终允许
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { useAiStore } from '@/stores/ai'

const aiStore = useAiStore()
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
