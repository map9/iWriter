import { createMediaWithCaptionExtension, MediaTypeConfigs } from './MediaCaptionFactory'
import MediaWithCaptionView from './MediaWithCaptionView.vue'

/**
 * AudioWithCaption节点 - 音频和标题的容器
 * 使用通用媒体标题架构，专门用于音频
 * 结构：caption? + audio + caption?
 * 支持top/bottom/none三种caption位置
 */
export const AudioWithCaption = createMediaWithCaptionExtension('audio', {
  nodeViewComponent: MediaWithCaptionView,
  ...MediaTypeConfigs.audio,
  
  // 扩展特定于音频的属性
  defaultAttributes: {
    ...MediaTypeConfigs.audio.defaultAttributes,
    autoplay: {
      default: false,
      parseHTML: element => {
        const audio = element.querySelector('audio')
        return audio?.hasAttribute('autoplay') || false
      },
      renderHTML: attributes => ({ 'data-autoplay': attributes.autoplay }),
    },
    loop: {
      default: false,
      parseHTML: element => {
        const audio = element.querySelector('audio')
        return audio?.hasAttribute('loop') || false
      },
      renderHTML: attributes => ({ 'data-loop': attributes.loop }),
    },
    muted: {
      default: false,
      parseHTML: element => {
        const audio = element.querySelector('audio')
        return audio?.hasAttribute('muted') || false
      },
      renderHTML: attributes => ({ 'data-muted': attributes.muted }),
    },
    preload: {
      default: 'metadata',
      parseHTML: element => {
        const audio = element.querySelector('audio')
        return audio?.getAttribute('preload') || 'metadata'
      },
      renderHTML: attributes => ({ 'data-preload': attributes.preload }),
    }
  }
}).extend({
  name: 'audioWithCaption',
  
  parseHTML() {
    return [
      {
        tag: 'figure[data-type="audio-with-caption"]',
      },
      ...this.parent?.() || []
    ]
  },
  
  renderHTML({ HTMLAttributes }) {
    return ['figure', { 
      ...HTMLAttributes, 
      'data-type': 'audio-with-caption',
      'data-media-type': 'audio'
    }, 0]
  }
})

export default AudioWithCaption