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
          window: 'var(--color-background-window)',
          content: 'var(--color-background-content)',
          underpage: 'var(--color-background-underpage)',
          selected: 'var(--color-background-selected)'
        },
        
        // 文本色
        text: {
          base: 'var(--color-text-base)',
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          tertiary: 'var(--color-text-tertiary)',
        },
        
        // 边框色
        border: {
          separator: 'var(--color-border-separator)',
          grid: 'var(--color-border-grid)',
          shadow: 'var(--color-border-shadow)'
        },
        
        // 交互色
        interactive: {
          control: 'var(--color-interactive-control)',
          elevated: 'var(--color-interactive-elevated)',
          hover: 'var(--color-interactive-hover)',
          focus: 'var(--color-interactive-focus)',
          link: 'var(--color-interactive-link)',
          highlight: 'var(--color-interactive-highlight)',
        },
        
        // 状态色
        status: {
          success: 'var(--color-status-success)',
          warning: 'var(--color-status-warning)',
          error: 'var(--color-status-error)',
          info: 'var(--color-status-info)',
          neutral: 'var(--color-status-neutral)'
        },
      },
      fontFamily: {
        sans: ['SF Pro Display', 'system-ui', 'sans-serif'],
        mono: ['SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', 'monospace']
      },
      //filter: {
      //  'brightness-hover': 'brightness(var(--brightness-hover, 0.85))',
      //},
    },
  },
  plugins: []
}