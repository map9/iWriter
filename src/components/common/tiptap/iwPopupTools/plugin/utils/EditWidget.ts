// 辅助函数
export const escapeHtml = (text: string): string => {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

export enum ElementDisplayMode {
  ALWAYS = 0,     // 永远显示
  EDITMODE = 1,   // 仅编辑模式显示
  NOEDITMODE = -1,// 编辑模式隐藏
}

export class EditWidget {
  static IconEdit = `<svg  xmlns="http://www.w3.org/2000/svg"  width="24"  height="24"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-edit"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M7 7h-1a2 2 0 0 0 -2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2 -2v-1" /><path d="M20.385 6.585a2.1 2.1 0 0 0 -2.97 -2.97l-8.415 8.385v3h3l8.385 -8.415z" /><path d="M16 5l3 3" /></svg>`
  static IconCheck = `<svg  xmlns="http://www.w3.org/2000/svg"  width="24"  height="24"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-check"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 12l5 5l10 -10" /></svg>`
  static IconUnlink = `<svg  xmlns="http://www.w3.org/2000/svg"  width="24"  height="24"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-unlink"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M17 22v-2" /><path d="M9 15l6 -6" /><path d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464" /><path d="M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463" /><path d="M20 17h2" /><path d="M2 7h2" /><path d="M7 2v2" /></svg>`
  static IconOutbound = `<svg  xmlns="http://www.w3.org/2000/svg"  width="24"  height="24"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-external-link"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6" /><path d="M11 13l9 -9" /><path d="M15 4h5v5" /></svg>`

  private editWidget: HTMLElement
  private floatingPanel: HTMLElement
  private editButton: HTMLButtonElement
  private toggleEditModeElements: { editMode: boolean, element: HTMLElement }[] = []

  constructor() {
    this.editWidget = document.createElement('span')
    this.editWidget.className = 'toolbar-warpper inline-block'
    this.editWidget.contentEditable = 'false'

    this.floatingPanel = document.createElement('div')
    this.floatingPanel.className = 'toolbar-controls floating'
    this.editWidget.appendChild(this.floatingPanel)

    this.toggleEditModeElements = []
    this.editButton = EditWidget.createButton({
      title: 'Edit',
      icon: EditWidget.IconEdit,
    })
    this.appendChildToPanel(this.editButton, ElementDisplayMode.NOEDITMODE)
  }

  get dom(): HTMLElement {
    return this.editWidget
  }

  get panel(): HTMLElement {
    return this.floatingPanel
  }

  get editBtn(): HTMLButtonElement {
    return this.editButton
  }

  appendChildToPanel(child: HTMLElement, displayMode: ElementDisplayMode = ElementDisplayMode.EDITMODE): void {
    this.floatingPanel.appendChild(child)
    if (displayMode !== ElementDisplayMode.ALWAYS) {
      this.toggleEditModeElements.push({
        editMode: displayMode === ElementDisplayMode.EDITMODE,
        element: child,
      })
    }
  }

  setEditMode(editMode: boolean = true): void {
    this.toggleEditModeElements.forEach(tl => {
      if (tl.editMode === editMode) {
        tl.element.classList.remove('hidden')
      } else {
        tl.element.classList.add('hidden')
      }
    })
  }

  static createButton({
    name,
    title,
    className,
    icon,
  }: {
    name?: string;
    title?: string;
    className?: string;
    icon?: string;
  }): HTMLButtonElement {
    const element = document.createElement('button');

    if (name) element.textContent = name;
    if (title) element.title = title;
    element.className = className ? `control-button ${className}` : 'control-button';
    if (icon) {
      element.innerHTML = icon;
      const svgElement = element.querySelector('svg');
      if (svgElement) {
        svgElement.classList.add('control-button-icon');
      }
    }
    
    return element;
  }

  static createGroup({
    className,
  }: {
    className?: string;
  }): HTMLElement {
    const element = document.createElement('div');
    element.className = className ? `control-group ${className}` : 'control-group';
    
    return element;
  }

  static createInput({
    type,
    className,
    placeholder,
    value,
    minlength,
    maxlength,
    required
  }: {
    type?: string;
    className?: string;
    placeholder?: string;
    value?: string;
    minlength?: number;
    maxlength?: number;
    required?: boolean;
  }): HTMLInputElement {
    const element = document.createElement('input');
    element.type = type ? type : 'text';
    element.className = className ? `control-input ${className}` : 'control-input';
    element.value = value ? value : '';
    element.placeholder = placeholder ? placeholder : '';
    if (minlength) element.minLength = minlength;
    if (maxlength) element.maxLength = maxlength;
    if (required) element.required = required;
    
    return element;
  }

  static createSelector({
    className,
    options,
    selectedValue,
  }: {
    className?: string;
    options?: {value: string, text: string}[] | string[];
    selectedValue?: string;
  }): HTMLElement {
    const element = document.createElement('select');
    element.className = className ? `control-selector ${className}` : 'control-selector';
    if (options) EditWidget.addOptionsToSelector(element, options, selectedValue);

    return element;
  }

  static addOptionsToSelector(
    selector: HTMLSelectElement,
    options: {value: string, text: string}[] | string[],
    selectedValue?: string
  ): void {
    // 清空现有选项
    selector.innerHTML = ''

    // 添加新选项
    options.forEach(option => {
      const opt = document.createElement('option')
      opt.value = typeof option === 'object' ? option.value : option
      opt.textContent = typeof option === 'object' ? option.text : option
      
      // 设置选中状态
      if (selectedValue && opt.value === selectedValue) {
        opt.selected = true
      }
      
      selector.appendChild(opt)
    });
  }

}

export default EditWidget