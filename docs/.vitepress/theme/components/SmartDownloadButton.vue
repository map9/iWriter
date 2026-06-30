<template>
  <div v-if="!enhanceHero" class="smart-download">
    <a
      :href="downloadUrl"
      class="smart-download-btn"
      :class="{ 'is-unsupported': isUnsupported }"
      :aria-disabled="isUnsupported ? 'true' : 'false'"
      @click="handleClick"
    >
      <span class="btn-icon">{{ isUnsupported ? '!' : '↓' }}</span>
      {{ label }}
    </a>
    <p class="smart-download-hint">{{ hint }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

type DownloadTarget =
  | 'windows'
  | 'mac-arm64'
  | 'mac-x64'
  | 'linux'
  | 'unsupported'
  | 'unknown'

type UserAgentDataNavigator = Navigator & {
  userAgentData?: {
    platform?: string
    getHighEntropyValues?: (
      hints: string[]
    ) => Promise<{ architecture?: string; bitness?: string; model?: string; platform?: string }>
  }
}

const DOWNLOAD_ROUTES: Record<DownloadTarget, string> = {
  windows: '/download#windows',
  'mac-arm64': '/download#macos-apple-silicon',
  'mac-x64': '/download#macos-intel',
  linux: '/download#linux',
  unsupported: '/download#unsupported-device',
  unknown: '/download'
}

const LABELS: Record<DownloadTarget, string> = {
  windows: '下载 Windows 安装包',
  'mac-arm64': '下载 macOS Apple Silicon 安装包',
  'mac-x64': '下载 macOS Intel 安装包',
  linux: '查看 Linux 下载包',
  unsupported: '当前设备暂不支持',
  unknown: '查看下载页'
}

const HINTS: Record<DownloadTarget, string> = {
  windows: '点击后直接下载最新 Windows 安装包',
  'mac-arm64': '点击后直接下载最新 Apple Silicon / ARM64 `.dmg`',
  'mac-x64': '点击后直接下载最新 Intel / x64 `.dmg`',
  linux: '点击后直接下载最新 Linux AppImage',
  unsupported: '暂不支持 iPad、iPhone、Android 等移动设备',
  unknown: '无法识别你的系统，请到下载页手动选择'
}

type ReleaseAsset = {
  name: string
  browser_download_url: string
}

type LatestReleaseResponse = {
  assets?: ReleaseAsset[]
}

const LATEST_RELEASE_API = 'https://api.github.com/repos/map9/iWriter/releases/latest'
let latestAssetsPromise: Promise<ReleaseAsset[]> | null = null

const target = ref<DownloadTarget>('unknown')
const downloadUrl = ref('/download')
const label = ref('查看下载页')
const hint = ref('无法识别你的系统，请到下载页手动选择')
const isUnsupported = ref(false)

const props = withDefaults(
  defineProps<{
    enhanceHero?: boolean
  }>(),
  {
    enhanceHero: false
  }
)

async function detectTarget(): Promise<DownloadTarget> {
  if (typeof navigator === 'undefined') return 'unknown'

  const nav = navigator as UserAgentDataNavigator
  const ua = navigator.userAgent.toLowerCase()
  const platform = (navigator.platform || '').toLowerCase()
  const isTouchMac = platform === 'macintel' && navigator.maxTouchPoints > 1
  const isMobile =
    ua.includes('android') ||
    ua.includes('iphone') ||
    ua.includes('ipad') ||
    ua.includes('ipod') ||
    ua.includes('mobile') ||
    isTouchMac

  if (isMobile) return 'unsupported'
  if (platform.includes('win') || ua.includes('windows')) return 'windows'

  if (platform.includes('mac') || ua.includes('macintosh') || ua.includes('mac os')) {
    const architecture = await detectMacArchitecture(nav, ua)
    return architecture === 'arm64' ? 'mac-arm64' : 'mac-x64'
  }

  if (platform.includes('linux') || ua.includes('linux') || ua.includes('x11')) return 'linux'
  return 'unknown'
}

function handleClick(e: MouseEvent) {
  if (isUnsupported.value) {
    e.preventDefault()
    window.location.href = DOWNLOAD_ROUTES.unsupported
    return
  }

  if (target.value === 'unknown') {
    e.preventDefault()
    window.location.href = DOWNLOAD_ROUTES.unknown
    return
  }

  if (downloadUrl.value.startsWith('/download')) {
    e.preventDefault()
    resolveDownloadUrl(target.value).then(url => {
      if (url) {
        downloadUrl.value = url
        window.location.href = url
        return
      }

      window.location.href = fallbackRouteFor(target.value)
    })
  }
}

async function detectMacArchitecture(nav: UserAgentDataNavigator, ua: string): Promise<'arm64' | 'x64'> {
  if (nav.userAgentData?.getHighEntropyValues) {
    try {
      const values = await nav.userAgentData.getHighEntropyValues(['architecture'])
      const architecture = (values.architecture || '').toLowerCase()
      if (architecture.includes('arm')) return 'arm64'
      if (architecture.includes('x86')) return 'x64'
    } catch {
      // Ignore and fall back to UA heuristics.
    }
  }

  if (ua.includes('arm64') || ua.includes('aarch64') || ua.includes('apple silicon')) {
    return 'arm64'
  }

  return 'x64'
}

function enhanceHomeHeroAction() {
  const heroActions = document.querySelector('.home-page .VPHomeHero .actions')
  const downloadAnchor = heroActions?.querySelector<HTMLAnchorElement>('.action:first-child a')

  if (!downloadAnchor) return

  downloadAnchor.textContent = label.value
  downloadAnchor.href = downloadUrl.value

  if (isUnsupported.value) {
    downloadAnchor.dataset.unsupported = 'true'
  } else {
    delete downloadAnchor.dataset.unsupported
  }
}

async function getLatestAssets(): Promise<ReleaseAsset[]> {
  if (!latestAssetsPromise) {
    latestAssetsPromise = fetch(LATEST_RELEASE_API)
      .then(async response => {
        if (!response.ok) {
          throw new Error(`GitHub API request failed: ${response.status}`)
        }

        const payload = (await response.json()) as LatestReleaseResponse
        return payload.assets || []
      })
      .catch(error => {
        latestAssetsPromise = null
        throw error
      })
  }

  return latestAssetsPromise
}

function fallbackRouteFor(currentTarget: DownloadTarget): string {
  switch (currentTarget) {
    case 'windows':
      return DOWNLOAD_ROUTES.windows
    case 'mac-arm64':
      return DOWNLOAD_ROUTES['mac-arm64']
    case 'mac-x64':
      return DOWNLOAD_ROUTES['mac-x64']
    case 'linux':
      return DOWNLOAD_ROUTES.linux
    case 'unsupported':
      return DOWNLOAD_ROUTES.unsupported
    default:
      return DOWNLOAD_ROUTES.unknown
  }
}

function findReleaseAsset(assets: ReleaseAsset[], currentTarget: DownloadTarget): ReleaseAsset | null {
  switch (currentTarget) {
    case 'windows':
      return (
        assets.find(asset => /(^|[ ._-])(setup|installer)([ ._-]|).*\.exe$/i.test(asset.name)) ||
        null
      )
    case 'mac-arm64':
      return (
        assets.find(asset => /arm64.*\.dmg$/i.test(asset.name)) ||
        assets.find(asset => /aarch64.*\.dmg$/i.test(asset.name)) ||
        null
      )
    case 'mac-x64':
      return (
        assets.find(asset => /x64.*\.dmg$/i.test(asset.name)) ||
        assets.find(asset => /intel.*\.dmg$/i.test(asset.name)) ||
        assets.find(asset => /mac.*\.dmg$/i.test(asset.name)) ||
        null
      )
    case 'linux':
      return (
        assets.find(asset => /\.appimage$/i.test(asset.name)) ||
        assets.find(asset => /\.deb$/i.test(asset.name)) ||
        assets.find(asset => /\.rpm$/i.test(asset.name)) ||
        null
      )
    default:
      return null
  }
}

async function resolveDownloadUrl(currentTarget: DownloadTarget): Promise<string | null> {
  if (currentTarget === 'unsupported' || currentTarget === 'unknown') {
    return null
  }

  try {
    const assets = await getLatestAssets()
    const asset = findReleaseAsset(assets, currentTarget)
    return asset?.browser_download_url || null
  } catch {
    return null
  }
}

onMounted(async () => {
  target.value = await detectTarget()
  label.value = LABELS[target.value]
  hint.value = HINTS[target.value]
  isUnsupported.value = target.value === 'unsupported'
  downloadUrl.value = fallbackRouteFor(target.value)

  if (!isUnsupported.value && target.value !== 'unknown') {
    const resolvedUrl = await resolveDownloadUrl(target.value)
    if (resolvedUrl) {
      downloadUrl.value = resolvedUrl
    }
  }

  if (props.enhanceHero) {
    enhanceHomeHeroAction()
  }
})
</script>

<style scoped>
.smart-download {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

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

.smart-download-btn.is-unsupported {
  background: #8a6f4d;
}

.smart-download-btn.is-unsupported:hover {
  background: #7b6142;
}

.btn-icon {
  font-size: 16px;
}

.smart-download-hint {
  margin: 0;
  color: var(--vp-c-text-2);
  font-size: 13px;
  line-height: 1.4;
}
</style>
