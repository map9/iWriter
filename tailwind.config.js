/** @type {import('tailwindcss').Config} */
// tailwind.config.js
module.exports = {
  content: [
    './src/**/*.{js,vue,ts,jsx,tsx}',
    './src/**/*.html',
  ],
  theme: {
    extend: {
      colors: {
        // 强调色
        accent: {
          primary: 'var(--color-accent-primary)',
        },
        
        // 背景色
        background: {
          primary: 'var(--color-background-primary)',
          secondary: 'var(--color-background-secondary)',
          tertiary: 'var(--color-background-tertiary)',
          elevated: 'var(--color-background-elevated)'
        },
        
        // 文本色
        text: {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          tertiary: 'var(--color-text-tertiary)',
          disabled: 'var(--color-text-disabled)'
        },
        
        // 边框色
        border: {
          primary: 'var(--color-border-primary)',
          secondary: 'var(--color-border-secondary)',
          focus: 'var(--color-border-focus)'
        },
        
        // 交互色
        interactive: {
          hover: 'var(--color-interactive-hover)',
          active: 'var(--color-interactive-active)',
          selected: 'var(--color-interactive-selected)'
        },
        
        // 状态色
        status: {
          success: 'var(--color-status-success)',
          warning: 'var(--color-status-warning)',
          error: 'var(--color-status-error)',
          info: 'var(--color-status-info)',
          neutral: 'var(--color-status-neutral)'
        },
        
        // 其他色彩
        other: {
          link: 'var(--color-other-link)',
          highlight: 'var(--color-other-highlight)',
          shadow: 'var(--color-other-shadow)'
        }
      },
      fontFamily: {
        sans: ['SF Pro Display', 'system-ui', 'sans-serif'],
        mono: ['SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', 'monospace']
      }
    },
  },
  plugins: []
}