<template>
  <node-view-wrapper :data-type="`${mediaType}-with-caption`" :class="containerClasses">
    <figure :class="figureClasses">
      <node-view-content class="media-content" />
    </figure>
  </node-view-wrapper>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { NodeViewWrapper, nodeViewProps, NodeViewContent } from '@tiptap/vue-3'

const props = defineProps(nodeViewProps)

// 获取媒体类型
const mediaType = computed(() => props.node.attrs.mediaType || 'image')

// 获取标题显示位置
const showCaption = computed(() => props.node.attrs.showCaption || 'bottom')

// 获取文本对齐方式
const textAlign = computed(() => props.node.attrs.textAlign || 'left')

// 容器样式类
const containerClasses = computed(() => [
  'media-with-caption-wrapper',
  `media-${mediaType.value}`,
  `caption-${showCaption.value}`,
  {
    'media-selected': props.selected,
    'media-focused': props.selected
  }
])

// Figure元素样式类
const figureClasses = computed(() => [
  'media-container',
  `media-container-${mediaType.value}`,
  `text-${textAlign.value}`,
  {
    'has-caption': showCaption.value !== 'none',
    'caption-top': showCaption.value === 'top',
    'caption-bottom': showCaption.value === 'bottom'
  }
])
</script>

<style lang="scss" scoped>
.media-with-caption-wrapper {
  position: relative;
  margin: 1.5rem 0;
  
  &.media-selected {
    .media-container {
      outline: 2px solid rgba(59, 130, 246, 0.5);
      outline-offset: 2px;
      border-radius: 8px;
    }
  }
}
</style>