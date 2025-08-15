// 上下文菜单项接口
export interface ContextMenuItem {
  id?: string
  label?: string
  type?: 'normal' | 'separator' | 'submenu' | 'checkbox' | 'radio'
  enabled?: boolean
  visible?: boolean
  checked?: boolean
  submenu?: ContextMenuItem[]
  accelerator?: string
  role?: string
}
