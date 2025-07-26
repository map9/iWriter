import { createMediaWithCaptionExtension, MediaTypeConfigs } from './MediaCaptionFactory'
import MediaWithCaptionView from './MediaWithCaptionView.vue'

/**
 * VideoWithCaption节点 - 视频和标题的容器
 * 使用通用媒体标题架构，专门用于视频
 * 结构：caption? + video + caption?
 * 支持top/bottom/none三种caption位置
 */
export const VideoWithCaption = createMediaWithCaptionExtension('video', {
  nodeViewComponent: MediaWithCaptionView,
  ...MediaTypeConfigs.video,
  
  // 扩展特定于视频的属性
  defaultAttributes: {
    ...MediaTypeConfigs.video.defaultAttributes,
    poster: {
      default: '',
      parseHTML: element => {
        const video = element.querySelector('video')
        return video?.getAttribute('poster') || ''
      },
      renderHTML: attributes => attributes.poster ? { 'data-poster': attributes.poster } : {},
    },
    autoplay: {
      default: false,
      parseHTML: element => {
        const video = element.querySelector('video')
        return video?.hasAttribute('autoplay') || false
      },
      renderHTML: attributes => ({ 'data-autoplay': attributes.autoplay }),
    },
    loop: {
      default: false,
      parseHTML: element => {
        const video = element.querySelector('video')
        return video?.hasAttribute('loop') || false
      },
      renderHTML: attributes => ({ 'data-loop': attributes.loop }),
    },
    muted: {
      default: false,
      parseHTML: element => {
        const video = element.querySelector('video')
        return video?.hasAttribute('muted') || false
      },
      renderHTML: attributes => ({ 'data-muted': attributes.muted }),
    }
  }
}).extend({
  name: 'videoWithCaption',
  
  parseHTML() {
    return [
      {
        tag: 'figure[data-type="video-with-caption"]',
      },
      ...this.parent?.() || []
    ]
  },
  
  renderHTML({ HTMLAttributes }) {
    return ['figure', { 
      ...HTMLAttributes, 
      'data-type': 'video-with-caption',
      'data-media-type': 'video'
    }, 0]
  }
})

export default VideoWithCaption