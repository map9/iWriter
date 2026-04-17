<template>
  <div
    v-if="!aiStore.displayMessages.length && !aiStore.liveTurnState && !aiStore.isSwitchingThread"
    class="flex flex-col items-center justify-center h-full text-center"
  >
    <div class="mt-4 flex flex-col items-center">
      <IconBrain class="size-12 text-base-content" />
      <p class="mt-2 text-md font-medium text-base-content">AI StoryMate</p>
      <p class="mt-1 max-w-xs text-xs leading-5 text-base-content opacity-50">
        选择一种编辑类型，再从下面的示例开始。
      </p>
    </div>

    <div class="mt-7 w-full max-w-md">
      <div class="min-h-5">
        <p class="text-sm font-semibold text-base-content">
          {{ currentGroup.title }}
        </p>
      </div>

      <div class="mt-4 grid grid-cols-2 gap-3 auto-rows-fr">
        <button
          v-for="prompt in currentGroup.prompts"
          :key="prompt"
          type="button"
          class="h-14 rounded-field border border-base-300 bg-base-100 px-2 py-2 text-left text-xs leading-4 text-base-content shadow-sm transition-colors overflow-hidden hover:bg-base-200"
          @click="emit('suggest', prompt)"
        >
          <span class="block">
            {{ prompt }}
          </span>
        </button>
      </div>

      <div class="mt-5 flex items-center justify-center gap-2">
        <button
          v-for="(group, index) in promptGroups"
          :key="group.title"
          type="button"
          class="icon-dot transition-all"
          :class="index === activeGroupIndex ? 'bg-base-content scale-150' : 'bg-base-100 border border-base-300 hover:bg-base-300 hover:cursor-pointer hover:scale-150'"
          :title="group.title"
          @click="activeGroupIndex = index"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { IconBrain } from '@tabler/icons-vue'
import { useAiStore } from '@/ai/store/ai'
import { useAppStore } from '@/stores/app'

interface PromptGroup {
  title: string
  prompts: string[]
}

const aiStore = useAiStore()
const appStore = useAppStore()
const emit = defineEmits<{ suggest: [prompt: string] }>()

const hasActiveDocument = computed(() => !!appStore.activeTab)
const activeGroupIndex = ref(0)
let carouselTimer: ReturnType<typeof setInterval> | null = null

const promptGroups = computed<PromptGroup[]>(() => {
  if (hasActiveDocument.value) {
    return [
      {
        title: '一、基础编辑',
        prompts: [
          '改写这一段，使表达更自然',
          '扩写这一节的情绪描写',
          '缩写这一段，保留核心信息',
          '检查这一章的语法和病句',
          '优化这一段文字节奏',
          '把这一节润色得更流畅',
        ],
      },
      {
        title: '二、风格调整',
        prompts: [
          '将第一章调整为古龙后期作品风格',
          '把这段对白改得更克制冷峻',
          '统一这一章的叙述语气',
          '增强这一节的悬念感',
          '把这一段写得更有电影感',
          '让文字风格更简洁凌厉',
        ],
      },
      {
        title: '三、人物调整',
        prompts: [
          '抹去宇文化及在这个章节中的痕迹',
          '强化主角在这一章中的压迫感',
          '弱化配角在此处的存在感',
          '让人物关系更紧张一些',
          '补强角色在这一节里的动机',
          '让人物说话方式更贴合身份',
        ],
      },
      {
        title: '四、场景调整',
        prompts: [
          '将故事中打斗的场景调整为辰时的街市酒楼中',
          '把这一段场景改成夜雨山道',
          '把当前场景调整得更拥挤、更喧闹',
          '把环境描写改得更有寒意',
          '把这一节转到室内密谈场景',
          '加强这个场景的临场感',
        ],
      },
      {
        title: '五、情节调整',
        prompts: [
          '把这一段情节改成误会驱动',
          '增强这一节的冲突升级',
          '调整这一段，让结尾留下悬念',
          '重排这一章的事件顺序，使推进更紧凑',
          '让这一节的转折更自然',
          '把这一段改成伏笔回收',
        ],
      },
    ]
  }

  return [
    {
      title: '一、开局构思',
      prompts: [
        '帮我想三个故事开头',
        '给这个题材设计一个主角',
        '给这部小说列一个三幕提纲',
        '想一个更抓人的开篇场景',
        '帮我设计核心冲突',
        '给我三个不同风格的设定方向',
      ],
    },
    {
      title: '二、风格起稿',
      prompts: [
        '把这个想法扩展成一段草稿',
        '用冷峻克制的风格写一个开头',
        '用更有画面感的方式写第一段',
        '帮我写一段人物初登场',
        '把这段设定写得更像小说正文',
        '给这段草稿做第一轮润色',
      ],
    },
    {
      title: '三、结构推进',
      prompts: [
        '帮我列第一章的情节推进',
        '设计这一段里的冲突升级',
        '给这一章安排一个反转',
        '补一个更合理的动机链条',
        '把这个桥段改得更紧凑',
        '设计一个悬念式结尾',
      ],
    },
  ]
})

const currentGroup = computed(() => promptGroups.value[activeGroupIndex.value] ?? promptGroups.value[0]!)

watch(promptGroups, groups => {
  if (activeGroupIndex.value >= groups.length) {
    activeGroupIndex.value = 0
  }
})

function startCarousel() {
  stopCarousel()
  if (promptGroups.value.length <= 1) return
  carouselTimer = setInterval(() => {
    activeGroupIndex.value = (activeGroupIndex.value + 1) % promptGroups.value.length
  }, 4200)
}

function stopCarousel() {
  if (carouselTimer) {
    clearInterval(carouselTimer)
    carouselTimer = null
  }
}

watch(promptGroups, () => {
  startCarousel()
})

onMounted(() => {
  startCarousel()
})

onUnmounted(() => {
  stopCarousel()
})
</script>
