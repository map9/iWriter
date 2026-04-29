<template>
  <div ref="container" class="home-media-grid" :class="{ 'is-packery-ready': packeryEnabled }">
    <article
      v-for="(item, index) in normalizedItems"
      :key="`${item.src}-${index}`"
      class="home-media-card"
      :class="[
        `home-media-card--${item.size}`,
        { 'home-media-card--video': item.type === 'video' }
      ]"
    >
      <div class="home-media-card__media">
        <a
          v-if="isExternalVideo(item)"
          class="home-media-card__external-link"
          :href="getExternalVideoHref(item)"
          target="_blank"
          rel="noreferrer"
          :aria-label="item.alt || item.title || '在新页面播放视频'"
        >
          <img
            v-if="item.poster"
            class="home-media-card__image"
            :src="item.poster"
            :alt="item.alt"
            loading="lazy"
          />
          <div v-else class="home-media-card__external-placeholder" aria-hidden="true"></div>
          <span class="home-media-card__play-button" aria-hidden="true">
            <svg viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="24" fill="currentColor" fill-opacity="0.92" />
              <path d="M19 15.5L34 24L19 32.5V15.5Z" fill="#111111" />
            </svg>
          </span>
        </a>
        <video
          v-else-if="item.type === 'video'"
          class="home-media-card__video"
          :src="item.src"
          :poster="item.poster"
          :autoplay="item.autoplay"
          :muted="item.muted"
          :loop="item.loop"
          :controls="item.controls"
          playsinline
          preload="metadata"
        />
        <img
          v-else
          class="home-media-card__image"
          :src="item.src"
          :alt="item.alt"
          loading="lazy"
        />

        <div v-if="item.badge || item.title" class="home-media-card__meta">
          <span v-if="item.badge" class="home-media-card__badge">{{ item.badge }}</span>
          <h3 v-if="item.title" class="home-media-card__title">{{ item.title }}</h3>
        </div>
      </div>
    </article>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  items: {
    type: Array,
    default: () => []
  },
  gap: {
    type: Number,
    default: 20
  },
  mobileBreakpoint: {
    type: Number,
    default: 768
  }
})

const container = ref(null)
const packeryEnabled = ref(false)

let packeryInstance = null
let imagesLoadedInstance = null
let resizeHandler = null

const normalizedItems = computed(() =>
  props.items.map((item) => ({
    type: item.type ?? 'image',
    size: item.size ?? 'small',
    autoplay: item.autoplay ?? item.type === 'video',
    muted: item.muted ?? item.type === 'video',
    loop: item.loop ?? item.type === 'video',
    controls: item.controls ?? item.type === 'video',
    ...item
  }))
)

function getExternalVideoHref(item) {
  return item.externalUrl ?? item.href ?? item.link ?? item.src
}

function isExternalVideo(item) {
  return item.type === 'video' && !!(item.external || item.externalUrl || item.href || item.link)
}

function shouldUsePackery() {
  return typeof window !== 'undefined' && window.innerWidth > props.mobileBreakpoint
}

function destroyPackery() {
  imagesLoadedInstance = null
  packeryEnabled.value = false

  if (packeryInstance) {
    packeryInstance.destroy()
    packeryInstance = null
  }
}

async function ensurePackery() {
  if (!container.value || !shouldUsePackery()) {
    destroyPackery()
    return
  }

  const [{ default: Packery }, { default: imagesLoaded }] = await Promise.all([
    import('packery'),
    import('imagesloaded')
  ])

  await nextTick()
  destroyPackery()

  if (!container.value || !shouldUsePackery()) return

  packeryInstance = new Packery(container.value, {
    itemSelector: '.home-media-card',
    gutter: props.gap,
    percentPosition: true,
    transitionDuration: '0.22s'
  })

  imagesLoadedInstance = imagesLoaded(container.value)
  imagesLoadedInstance.on('progress', () => packeryInstance?.layout())
  imagesLoadedInstance.on('always', () => packeryInstance?.layout())

  packeryEnabled.value = true
  requestAnimationFrame(() => packeryInstance?.layout())
}

function handleResize() {
  if (shouldUsePackery()) {
    if (packeryInstance) {
      packeryInstance.layout()
    } else {
      void ensurePackery()
    }
    return
  }

  destroyPackery()
}

onMounted(() => {
  resizeHandler = () => handleResize()
  window.addEventListener('resize', resizeHandler, { passive: true })
  void ensurePackery()
})

watch(
  () => props.items,
  async () => {
    await nextTick()
    if (shouldUsePackery()) {
      void ensurePackery()
    }
  },
  { deep: true }
)

onBeforeUnmount(() => {
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler)
  }
  destroyPackery()
})
</script>
