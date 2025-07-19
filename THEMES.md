# iWriter 主题系统

## 概述

iWriter 现在拥有一个完整的多主题系统，支持：
- **Follow System** - 跟随系统颜色设置
- **Light/Dark** - 默认的浅色和深色主题
- **多个自定义主题** - Ocean、Forest、Sunset 等

## 主题架构

### 1. 主题定义 (`src/utils/themes.ts`)

每个主题都包含完整的颜色规范：
- **Background Colors**: primary, secondary, tertiary, elevated
- **Text Colors**: primary, secondary, tertiary, disabled  
- **Border Colors**: primary, secondary, focus
- **Interactive Colors**: hover, active, selected
- **Accent Colors**: primary, secondary
- **Status Colors**: success, warning, error, info

### 2. 系统主题跟随

当选择 "Follow System" 时，应用会：
- 检测系统的浅色/深色偏好
- 使用系统原生颜色而不是自定义主题
- 自动响应系统主题变化

### 3. CSS 变量系统

所有主题颜色通过 CSS 变量动态应用：
```css
--color-background-primary
--color-text-primary
--color-accent-primary
/* 等等... */
```

## 可用主题

1. **Follow System** (`system`) - 跟随系统设置
2. **Light** (`light`) - 默认浅色主题
3. **Dark** (`dark`) - 默认深色主题  
4. **Ocean** (`ocean`) - 海洋蓝深色主题
5. **Forest** (`forest`) - 森林绿深色主题
6. **Sunset** (`sunset`) - 日落橙浅色主题

## 菜单集成

主题可以通过以下菜单操作切换：
- `view-theme-follow-system` - 跟随系统
- `view-theme-light` - 浅色主题
- `view-theme-dark` - 深色主题
- `view-theme-ocean` - 海洋主题
- `view-theme-forest` - 森林主题
- `view-theme-sunset` - 日落主题

## 使用方法

### 在组件中切换主题

```typescript
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()

// 切换到特定主题
appStore.setTheme('ocean')

// 获取当前主题
const currentTheme = appStore.getCurrentTheme()

// 获取所有可用主题
const themes = appStore.getAvailableThemes()
```

### 在CSS中使用主题变量

```css
.my-component {
  background-color: var(--color-background-primary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border-primary);
}

.my-button:hover {
  background-color: var(--color-interactive-hover);
}
```

### 使用主题工具类

```html
<div class="theme-panel theme-border">
  <p class="theme-text-primary">主要文本</p>
  <p class="theme-text-secondary">次要文本</p>
  <button class="theme-hover">悬停效果按钮</button>
</div>
```

## 添加新主题

1. 在 `src/utils/themes.ts` 中定义新主题：

```typescript
export const myCustomTheme: Theme = {
  id: 'my-theme',
  name: 'My Custom Theme',
  type: 'dark', // 或 'light'
  colors: {
    // 定义所有颜色...
  }
}
```

2. 将主题添加到 `availableThemes` 数组

3. 在 `electron/main.ts` 中添加菜单项

4. 在 `src/stores/app.ts` 中添加菜单处理

## 特性

- ✅ **自动系统跟随** - 检测并响应系统主题变化
- ✅ **持久化存储** - 主题偏好保存到 localStorage
- ✅ **实时切换** - 主题变化立即生效，无需重启
- ✅ **菜单同步** - 菜单选项正确反映当前主题状态
- ✅ **CSS变量** - 完整的CSS变量系统支持
- ✅ **类型安全** - 完整的TypeScript类型定义
- ✅ **可扩展** - 易于添加新的自定义主题

## 示例组件

参考 `src/components/ThemeDemo.vue` 了解如何在组件中使用主题系统。