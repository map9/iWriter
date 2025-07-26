import { createMediaWithCaptionExtension, MediaTypeConfigs } from './MediaCaptionFactory'
import MediaWithCaptionView from './MediaWithCaptionView.vue'

/**
 * TableWithCaption节点 - 表格和标题的容器
 * 使用通用媒体标题架构，专门用于表格
 * 结构：caption? + table + caption?
 * 支持top/bottom/none三种caption位置
 */
export const TableWithCaption = createMediaWithCaptionExtension('table', {
  nodeViewComponent: MediaWithCaptionView,
  ...MediaTypeConfigs.table,
  
  // 扩展特定于表格的属性
  defaultAttributes: {
    ...MediaTypeConfigs.table.defaultAttributes,
    bordered: {
      default: true,
      parseHTML: element => {
        const table = element.querySelector('table')
        return table?.hasAttribute('data-bordered') !== false
      },
      renderHTML: attributes => ({ 'data-bordered': attributes.bordered }),
    },
    striped: {
      default: false,
      parseHTML: element => {
        const table = element.querySelector('table')
        return table?.hasAttribute('data-striped') || false
      },
      renderHTML: attributes => ({ 'data-striped': attributes.striped }),
    },
    compact: {
      default: false,
      parseHTML: element => {
        const table = element.querySelector('table')
        return table?.hasAttribute('data-compact') || false
      },
      renderHTML: attributes => ({ 'data-compact': attributes.compact }),
    }
  }
}).extend({
  name: 'tableWithCaption',
  
  parseHTML() {
    return [
      {
        tag: 'figure[data-type="table-with-caption"]',
      },
      ...this.parent?.() || []
    ]
  },
  
  renderHTML({ HTMLAttributes }) {
    return ['figure', { 
      ...HTMLAttributes, 
      'data-type': 'table-with-caption',
      'data-media-type': 'table'
    }, 0]
  }
})

export default TableWithCaption