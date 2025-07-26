import { createMediaWithCaptionExtension, MediaTypeConfigs } from './MediaCaptionFactory'
import MediaWithCaptionView from './MediaWithCaptionView.vue'

/**
 * YoutubeWithCaption节点 - YouTube视频和标题的容器
 * 使用通用媒体标题架构，专门用于YouTube嵌入
 * 结构：caption? + youtube + caption?
 * 支持top/bottom/none三种caption位置
 */
export const YoutubeWithCaption = createMediaWithCaptionExtension('youtube', {
  nodeViewComponent: MediaWithCaptionView,
  ...MediaTypeConfigs.youtube,
  
  // 扩展特定于YouTube的属性
  defaultAttributes: {
    ...MediaTypeConfigs.youtube.defaultAttributes,
    width: {
      default: 640,
      parseHTML: element => {
        const iframe = element.querySelector('iframe')
        return parseInt(iframe?.getAttribute('width') || '640')
      },
      renderHTML: attributes => ({ 'data-width': attributes.width }),
    },
    height: {
      default: 480,
      parseHTML: element => {
        const iframe = element.querySelector('iframe')
        return parseInt(iframe?.getAttribute('height') || '480')
      },
      renderHTML: attributes => ({ 'data-height': attributes.height }),
    },
    start: {
      default: 0,
      parseHTML: element => {
        const iframe = element.querySelector('iframe')
        const src = iframe?.getAttribute('src') || ''
        const match = src.match(/[?&]start=(\d+)/)
        return match ? parseInt(match[1]) : 0
      },
      renderHTML: attributes => ({ 'data-start': attributes.start }),
    },
    controls: {
      default: true,
      parseHTML: element => {
        const iframe = element.querySelector('iframe')
        const src = iframe?.getAttribute('src') || ''
        return !src.includes('controls=0')
      },
      renderHTML: attributes => ({ 'data-controls': attributes.controls }),
    },
    nocookie: {
      default: true,
      parseHTML: element => {
        const iframe = element.querySelector('iframe')
        const src = iframe?.getAttribute('src') || ''
        return src.includes('youtube-nocookie.com')
      },
      renderHTML: attributes => ({ 'data-nocookie': attributes.nocookie }),
    }
  }
}).extend({
  name: 'youtubeWithCaption',
  
  parseHTML() {
    return [
      {
        tag: 'figure[data-type="youtube-with-caption"]',
      },
      ...this.parent?.() || []
    ]
  },
  
  renderHTML({ HTMLAttributes }) {
    return ['figure', { 
      ...HTMLAttributes, 
      'data-type': 'youtube-with-caption',
      'data-media-type': 'youtube'
    }, 0]
  }
})

export default YoutubeWithCaption