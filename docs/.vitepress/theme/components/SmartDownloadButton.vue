<template>
  <a :href="downloadUrl" class="smart-download-btn" @click="handleClick">
    <span class="btn-icon">↓</span>
    {{ label }}
  </a>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

type OS = 'mac' | 'windows' | 'linux' | 'unknown'

const DOWNLOAD_URLS: Record<OS, string> = {
  mac: 'https://github.com/map9/iWriter/releases/latest/download/iWriter.dmg',
  windows: 'https://github.com/map9/iWriter/releases/latest/download/iWriter-Setup.exe',
  linux: 'https://github.com/map9/iWriter/releases/latest/download/iWriter.AppImage',
  unknown: '/download'
}

const LABELS: Record<OS, string> = {
  mac: '下载 for macOS',
  windows: '下载 for Windows',
  linux: '下载 for Linux',
  unknown: '立即下载'
}

const os = ref<OS>('unknown')
const downloadUrl = ref('/download')
const label = ref('立即下载')

function detectOS(): OS {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent.toLowerCase()
  const platform = (navigator.platform || '').toLowerCase()
  if (platform.includes('mac') || ua.includes('macintosh') || ua.includes('mac os')) return 'mac'
  if (platform.includes('win') || ua.includes('windows')) return 'windows'
  if (platform.includes('linux') || ua.includes('linux')) return 'linux'
  return 'unknown'
}

function handleClick(e: MouseEvent) {
  if (os.value === 'unknown') {
    e.preventDefault()
    window.location.href = '/download'
  }
}

onMounted(() => {
  os.value = detectOS()
  downloadUrl.value = DOWNLOAD_URLS[os.value]
  label.value = LABELS[os.value]
})
</script>

<style scoped>
.smart-download-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 12px 24px;
  background: var(--vp-c-brand-1);
  color: #fff !important;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  text-decoration: none !important;
  transition: background 0.2s;
}

.smart-download-btn:hover {
  background: var(--vp-c-brand-2);
}

.btn-icon {
  font-size: 16px;
}
</style>
