// Theme System for iWriter
export interface ThemeColors {
  // Accent colors
  accent: {
    primary: string   // accent color
    //secondary: string // = background.elevated
    //tertiary: string  // = interactive.active
    //quaternary: string// = interactive.selected
  }

  // Background colors
  background: {
    primary: string   // window-background
    secondary: string // control-background
    tertiary: string  // under-page-background
    elevated: string  // selected-text-background
  }
  
  // Text colors
  text: {
    primary: string   // label
    secondary: string // secondary-label
    tertiary: string  // tertiary-label
    disabled: string  // quaternary-label
  }
  
  // UI colors
  border: {
    primary: string   // separator
    secondary: string // grid
    focus: string     // keyboard-focus-indicator
  }
  
  // Interactive colors
  interactive: {
    hover: string     // 
    active: string    // selected-text
    selected: string  // selected-content-background
  }

  // Status colors
  status: {
    success: string
    warning: string
    error: string
    info: string      // accent.primary
    neutral: string
  }

  // Other colors
  other: {
    link: string      // link
    highlight: string // find-highlight
    shadow: string // shadow
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
      primary: '#ECECECFF',
      secondary: '#FFFFFFFF',
      tertiary: '#969696E5',
      elevated: '#B3D7FFFF'
    },
    text: {
      primary: '#000000D8',
      secondary: '#0000007F',
      tertiary: '#00000042',
      disabled: '#00000019'
    },
    border: {
      primary: '#00000019',
      secondary: '#E6E6E6FF',
      focus: '#0067F47F'
    },
    interactive: {
      hover: '#BFBFBFBF',
      active: '#000000FF',
      selected: '#0064E1FF'
    },    
    status: {
      success: '#34C759FF',
      warning: '#FF9500FF',
      error: '#FF3B30FF',
      info: '#007AFFFF',
      neutral: '#8E8E93FF'
    },
    other: {
      link: '#0068DAFF',
      highlight: '#FFFF00FF',
      shadow: '#000000FF'
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
      primary: '#323232FF',
      secondary: '#1E1E1EFF',
      tertiary: '#282828FF',
      elevated: '#3F638BFF'
    },
    text: {
      primary: '#FFFFFFD8',
      secondary: '#FFFFFF8C',
      tertiary: '#FFFFFF3F',
      disabled: '#FFFFFF19'
    },
    border: {
      primary: '#FFFFFF19',
      secondary: '#1A1A1AFF',
      focus: '#1AA9FF7F'
    },
    interactive: {
      hover: '#BFBFBFBF',
      active: '#FFFFFFFF',
      selected: '#0059D1FF'
    },    
    status: {
      success: '#30D158FF',
      warning: '#FFD60AFF',
      error: '#FF453AFF',
      info: '#007AFFFF',
      neutral: '#8E8E93FF'
    },
    other: {
      link: '#0068DAFF',
      highlight: '#FFFF00FF',
      shadow: '#000000FF'
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

// Additional custom themes
export const oceanTheme: Theme = {
  id: 'ocean',
  name: 'Ocean',
  type: 'dark',
  colors: {
    accent: {
      primary: '#00acc1',
    },
    background: {
      primary: '#0c1821',
      secondary: '#1b2935',
      tertiary: '#2a3441',
      elevated: '#1b2935'
    },
    text: {
      primary: '#e0f2fe',
      secondary: '#b3e5fc',
      tertiary: '#81d4fa',
      disabled: '#4fc3f7'
    },
    border: {
      primary: '#2a3441',
      secondary: '#3a4651',
      focus: '#00acc1'
    },
    interactive: {
      hover: '#2a3441',
      active: '#3a4651',
      selected: '#006064'
    },
    status: {
      success: '#4caf50',
      warning: '#ff9800',
      error: '#f44336',
      info: '#00acc1',
      neutral: '#8E8E93FF'
    },
    other: {
      link: '#0068DAFF',
      highlight: '#FFFF00FF',
      shadow: '#000000FF'
    }
  }
}

export const forestTheme: Theme = {
  id: 'forest',
  name: 'Forest',
  type: 'dark',
  colors: {
    accent: {
      primary: '#66bb6a'
    },
    background: {
      primary: '#0d1b0d',
      secondary: '#1a2e1a',
      tertiary: '#2d4a2d',
      elevated: '#1a2e1a'
    },
    text: {
      primary: '#e8f5e8',
      secondary: '#c8e6c9',
      tertiary: '#a5d6a7',
      disabled: '#81c784'
    },
    border: {
      primary: '#2d4a2d',
      secondary: '#3e5a3e',
      focus: '#66bb6a'
    },
    interactive: {
      hover: '#2d4a2d',
      active: '#3e5a3e',
      selected: '#2e7d32'
    },
    status: {
      success: '#66bb6a',
      warning: '#ffb74d',
      error: '#e57373',
      info: '#64b5f6',
      neutral: '#8E8E93FF'
    },
    other: {
      link: '#0068DAFF',
      highlight: '#FFFF00FF',
      shadow: '#000000FF'
    }
  }
}

export const sunsetTheme: Theme = {
  id: 'sunset',
  name: 'Sunset',
  type: 'light',
  colors: {
    accent: {
      primary: '#ff8f00'
    },
    background: {
      primary: '#fff8e1',
      secondary: '#ffecb3',
      tertiary: '#ffe082',
      elevated: '#fff8e1'
    },
    text: {
      primary: '#3e2723',
      secondary: '#5d4037',
      tertiary: '#795548',
      disabled: '#a1887f'
    },
    border: {
      primary: '#ffe082',
      secondary: '#ffcc02',
      focus: '#ff8f00'
    },
    interactive: {
      hover: '#ffe082',
      active: '#ffcc02',
      selected: '#ffb300'
    },
    status: {
      success: '#388e3c',
      warning: '#f57c00',
      error: '#d32f2f',
      info: '#1976d2',
      neutral: '#8E8E93FF'
    },
    other: {
      link: '#0068DAFF',
      highlight: '#FFFF00FF',
      shadow: '#000000FF'
    }
  }
}

// Available themes registry
export const availableThemes: Theme[] = [
  systemTheme,
  lightTheme,
  darkTheme,
  oceanTheme,
  forestTheme,
  sunsetTheme
]

// Utility functions
export function getThemeById(id: string): Theme | undefined {
  return availableThemes.find(theme => theme.id === id)
}

export function getSystemColors(): ThemeColors {
  // Check if system prefers dark mode
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  
  if (prefersDark) {
    return darkTheme.colors
  } else {
    return lightTheme.colors
  }
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
  const root = document.documentElement
  const colors = theme.isSystem ? getSystemColors() : theme.colors
  
  // Apply CSS custom properties
  Object.entries(colors).forEach(([category, categoryColors]) => {
    Object.entries(categoryColors as Record<string, string>).forEach(([colorName, colorValue]) => {
      root.style.setProperty(`--color-${category}-${colorName}`, hex8ToRGBA(colorValue))
    })
  })
  
  // Apply theme class ???
  root.classList.remove('light', 'dark', 'system')
  root.classList.add(theme.type === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme.type)
}