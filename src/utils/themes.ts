// Theme System for iWriter
// selected-menu-item-text = white
export interface ThemeColors {
  // Accent colors
  accent: {
    primary: string
  }

  // Background colors: Control Background / Window Background
  background: {
    // window-background - The background of a window.
    // Titlebar / Sidebar / Toolbar / Dialog background
    window: string
    // control-background - The background of a large interface element, such as a browser or table.
    // text-background
    content: string
    // under-page-background - The background behind a document's content.
    underpage: string
    // selected-content-background - The background for selected content in a key window or view.
    // [accent color]
    selected: string
  }
  
  // Text colors: Text / Label / Placeholder Text
  text: {
    // text - The text in a document. 
    // selected-text / unemphasized-selected-text
    base: string
    // label - The text of a label containing primary content.
    // control-text / selected-control-text / window-frame-fext / header-text
    primary: string
    // secondary-label - The text of a label of lesser importance than a normal label such as a label used to represent a subheading or additional information.
    secondary: string
    // tertiary-label - The text of a label of lesser importance than a secondary label such as a label used to represent disabled text.
    // disabled-control-text / placeholder-text
    tertiary: string
    // missed: unemphasized-selected-content-background / unemphasized-selected-text-background
  }
  
  // Border colors: Separator / Grid / Shadow
  border: {
    // separator - A separator between different sections of content. macOS 10.14
    separator: string
    // grid - The gridlines of an interface element such as a table.
    grid: string
    // shadow = dark
    shadow: string
  }
  
  // Interactive colors: control, link, selected-control
  interactive: {
    // control - control - The surface of a control. unsupported
    control: string
    // selected-text-background - The background of selected text. macOS 10.14
    // selected-control: selected checkbox / radio / button background
    // [light accent color]
    elevated: string
    // 
    hover: string
    // keyboard-focus-indicator - The ring that appears around the currently focused control when using the keyboard for interface navigation.
    // (dark accent color)
    focus: string
    // link - A link to other content.
    link: string
    // find-highlight - The color of a find indicator. macOS 10.14
    highlight: string
    // scrubber-textured-background = white
  }

  // Status colors
  status: {
    success: string
    warning: string
    error: string
    info: string      // accent.primary
    neutral: string
  }
}

export interface Theme {
  id: string
  name: string
  type: 'light' | 'dark' | 'system'
  colors: ThemeColors
  isSystem?: boolean
}

// Default Light Theme
export const lightTheme: Theme = {
  id: 'light',
  name: 'Light',
  type: 'light',
  colors: {
    accent: {
      primary: '#007AFFFF',
    },
    background: {
      window: '#ECECECFF',
      content: '#FFFFFFFF',
      underpage: '#969696E5',
      selected: '#0064E1FF'
    },
    text: {
      base: '#000000FF',
      primary: '#000000D8',
      secondary: '#0000007F',
      tertiary: '#00000042',
    },
    border: {
      separator: '#00000019',
      grid: '#E6E6E6FF',
      shadow: '#000000FF'
    },
    interactive: {
      control: '#FFFFFFFF',
      elevated: '#B3D7FFFF',
      hover: '#BFBFBFBF',
      focus: '#0067F47F',
      link: '#0068DAFF',
      highlight: '#FFFF00FF',
    },    
    status: {
      success: '#34C759FF',
      warning: '#FF9500FF',
      error: '#FF3B30FF',
      info: '#007AFFFF',
      neutral: '#8E8E93FF'
    }
  }
}

// Default Dark Theme
export const darkTheme: Theme = {
  id: 'dark',
  name: 'Dark',
  type: 'dark',
  colors: {
    accent: {
      primary: '#007AFFFF',
    },
    background: {
      window: '#323232FF',
      content: '#1E1E1EFF',
      underpage: '#282828FF',
      selected: '#0059D1FF'
    },
    text: {
      base: '#FFFFFFFF',
      primary: '#FFFFFFD8',
      secondary: '#FFFFFF8C',
      tertiary: '#FFFFFF3F',
    },
    border: {
      separator: '#FFFFFF19',
      grid: '#1A1A1AFF',
      shadow: '#000000FF'
    },
    interactive: {
      control: '#FFFFFF3F',
      elevated: '#3F638BFF',
      hover: '#404040FF',
      focus: '#1AA9FF7F',
      link: '#419CFFFF',
      highlight: '#FFFF00FF',
    },    
    status: {
      success: '#30D158FF',
      warning: '#FFD60AFF',
      error: '#FF453AFF',
      info: '#007AFFFF',
      neutral: '#8E8E93FF'
    }
  }
}

// System Theme (will use system colors dynamically)
export const systemTheme: Theme = {
  id: 'system',
  name: 'Follow System',
  type: 'system',
  isSystem: true,
  colors: lightTheme.colors // Fallback, will be replaced with system colors
}

// Available themes registry
export const availableThemes: Theme[] = [
  systemTheme,
  lightTheme,
  darkTheme,
]

// Utility functions
export function getThemeById(id: string): Theme | undefined {
  return availableThemes.find(theme => theme.id === id)
}

function mergeDeep(target: any, ...sources: any) {
  if (!sources.length) return target;
  const source = sources.shift();

  if (typeof target === 'object' && target !== null && typeof source === 'object' && source !== null) {
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        if (typeof source[key] === 'object' && source[key] !== null) {
          if (!target[key]) Object.assign(target, { [key]: {} });
          mergeDeep(target[key], source[key]);
        } else {
          Object.assign(target, { [key]: source[key] });
        }
      }
    }
  }

  return mergeDeep(target, ...sources);
}

export function applySystemColors(themeAndColors: { theme: 'light' | 'dark' | 'unknown', newColors: any }) {
  const root = document.documentElement
  let newColors: any = null

  // console.log(newColors)
  // 实际上 Electron 应用获取的系统颜色只有在应用第一次获取时有效，后续获取的系统颜色都是缓存，没有及时更新；主题是每次都更新。
  // 在 MacOS 中，经过测试 Accent color会发生变化，其他都不会发生变化
  // 因此，这个部分的代码，不能达到实际效果
  /*
  if (themeAndColors.theme === 'dark') {
    newColors = !newColors? darkTheme.colors : mergeDeep({}, darkTheme.colors, newColors)
  } else if (themeAndColors.theme === 'light') {
    newColors = !newColors? lightTheme.colors : mergeDeep({}, lightTheme.colors, newColors)
  } else {
    newColors = lightTheme.colors
    console.warn('Unknown system theme, falling back to light theme colors.')
  }
  */
  if (themeAndColors.theme === 'dark') {
    newColors = darkTheme.colors
  } else if (themeAndColors.theme === 'light') {
    newColors = lightTheme.colors, newColors
  }

  Object.entries(newColors).forEach(([category, categoryColors]) => {
    Object.entries(categoryColors as Record<string, string>).forEach(([colorName, colorValue]) => {
      root.style.setProperty(`--color-${category}-${colorName}`, hex8ToRGBA(colorValue))
    })
  })
}

export function hex8ToRGBA(hex: string, alpha: string = '1') {
  const h = hex.replace('#', '')
  
  if (h.length !== 8 && h.length !== 6) {
    throw new Error('hex格式应该是 #RRGGBBAA or #RRGGBB')
  }
  
  const r = parseInt(h.substring(0, 2), 16)  // Red
  const g = parseInt(h.substring(2, 4), 16)  // Green  
  const b = parseInt(h.substring(4, 6), 16)  // Blue
  if (h.length == 8) {
    const a = parseInt(h.substring(6, 8), 16)  // Alpha
    alpha = (a / 255).toFixed(3)
  }
    
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function applyThemeColors(theme: Theme) {
  if (theme.isSystem) {
    window.electronAPI.getSystemColors().then(themeAndColors => {
      applySystemColors(themeAndColors)
    })
    return
  }

  const root = document.documentElement
  Object.entries(theme.colors).forEach(([category, categoryColors]) => {
    Object.entries(categoryColors as Record<string, string>).forEach(([colorName, colorValue]) => {
      root.style.setProperty(`--color-${category}-${colorName}`, hex8ToRGBA(colorValue))
    })
  })
  
  // Apply theme class ???
  //root.classList.remove('light', 'dark', 'system')
  //root.classList.add(theme.type === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme.type)
}