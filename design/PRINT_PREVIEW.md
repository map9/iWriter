# Print Preview 功能说明

## 概述

Print Preview 是一个模态对话框功能，让用户在正式打印前预览文档的分页效果，并提供打印参数配置。分页渲染采用 [paged.js](https://pagedjs.org/)（v0.4.3，已列为生产依赖）。

触发方式：
- Markdown 编辑器工具栏右侧的打印机图标按钮
- 菜单 File → Print...（快捷键 ⌘P）

---

## 文件结构

| 文件 | 说明 |
|---|---|
| `src/components/print-preview/PrintPreviewDialog.vue` | 对话框主组件（预览 + 设置面板） |
| `src/components/print-preview/buildPreviewDoc.ts` | 构建 iframe 预览 HTML 文档（含内联 pagedjs 源码及 N-up 排列脚本） |
| `src/stores/app.ts` | `showPrintPreviewDialog`、`printPreviewHtml`、`openPrintPreview()`、`closePrintPreview()` |
| `src/views/MainView.vue` | 注册 `<PrintPreviewDialog>` |
| `src/components/pages/MarkdownEditorPage.vue` | 工具栏按钮 + `handleMenuAction` 拦截 `'print'` |
| `electron/WindowManager.ts` | `get-printers`、`print`、`save-to-pdf` IPC handlers |
| `electron/preload.ts` | 暴露 `getPrinters()`、`print()`、`saveToPdf()` |
| `src/types/electron-api.ts` | `ElectronAPI` 接口对应类型声明 |
| `src/types/pagedjs.d.ts` | pagedjs 模块的 ambient 类型声明 |

---

## 架构与数据流

### 打开对话框

```
工具栏按钮 / 菜单 ⌘P
    │
    ▼ MarkdownEditorPage.handleMenuAction('print') 或 openPrintPreview()
    │
    ▼ appStore.openPrintPreview(editor.getHTML())
        ├── printPreviewHtml = html
        └── showPrintPreviewDialog = true
    │
    ▼ MainView.vue 中的 <PrintPreviewDialog :visible="..." :html="...">
    │
    ▼ watch(props.visible) → await nextTick() → renderPreview()
```

### paged.js 渲染流程（iframe 内部）

```
buildPreviewDocument(html, printCss, pagesPerSheet)
    │
    ▼ 生成自包含 HTML 文档（pagedjs ESM 已内联）
    │
    ▼ Blob URL → iframe.src
    │
    ▼ iframe 内部：Previewer.preview() → N-up 重排（如 pagesPerSheet > 1）
    │
    ▼ postMessage('paged-ready', { total, scrollHeight })
    │
    ▼ totalPages.value = total; iframe 高度自动适配
```

### 另存为 PDF 流程

```
用户选择打印机 "另存为 PDF" → 点击"保存为 PDF..."
    │
    ▼ withPrintDomMigration() — iframe 移至 body 顶层，填满视口
    │
    ▼ window.electronAPI.saveToPdf(pdfOptions)
        → IPC: 'save-to-pdf'
        → 主进程: dialog.showSaveDialog() → 用户选择文件路径
        → 主进程: webContents.printToPDF(options) → 写入文件
    │
    ▼ finally: DOM 恢复原位
```

### 普通打印流程（DOM 搬移技术）

```typescript
async function withPrintDomMigration(callback) {
  // 1. iframe 移至 body 顶层，position:fixed 填满视口
  // 2. 注入 @media print CSS，隐藏除 iframe 外所有元素
  try {
    await callback()  // → electronAPI.print({ silent, ... })
  } finally {
    // 3. 恢复 DOM 原位
  }
}
```

---

## 设置参数说明

| 参数 | 变量 | 影响 paged.js 重渲染 | 说明 |
|---|---|---|---|
| 目标打印机 | `selectedPrinter` | 否（切换打印机会重渲染以验证纸张） | 含"另存为 PDF"伪打印机 |
| 页面范围 | `pageRange` / `customPageRange` | 否 | 全部 / 奇数页 / 偶数页 / 自定义 |
| 份数 | `copies` | 否 | PDF 打印机时隐藏 |
| 布局 | `orientation` | **是** | 纵向 / 横向，影响 `@page { size }` |
| 纸张尺寸 | `paperSize` | **是** | 依据打印机 CUPS capabilities 动态列表 |
| 每版打印页数 | `pagesPerSheet` | **是** | N-up 布局由 buildPreviewDoc 的内联脚本实现 |
| 边距 | `margins` | **是** | 影响 `@page { margin }` 及 Electron margins |
| 打印质量 | `dpi` | 否 | PDF 打印机时隐藏 |
| 缩放 | `scaleMode` / `customScale` | 否 | 默认 100% 或自定义数值 |
| 颜色 | `colorMode` | **是**（预览用 CSS grayscale filter） | 依据打印机 color 能力显示；PDF 打印机时隐藏 |
| 背景图形 | `printBackground` | 否 | 传给 Electron print / printToPDF |
| 打印页眉和页脚 | `printHeaderFooter` | **是** | 通过 paged.js `@page { @bottom-center }` 注入页码 |

---

## 打印样式（generatePrintCSS）

CSS 在 `generatePrintCSS()` 中动态生成，依据当前设置插值：

```css
@page {
  size: 210mm 297mm;      /* portrait A4；横向时 swap 为 297mm 210mm */
  margin: 20mm;
}
/* printHeaderFooter = true 时追加: */
@page {
  @bottom-center {
    content: counter(page) " / " counter(pages);
    font-size: 8pt; color: #666;
  }
}
/* colorMode = 'grayscale' 时追加: */
html { filter: grayscale(1); }
```

---

## 打印机能力检测

通过 `Electron.PrinterInfo.options`（CUPS 属性字典）检测打印机能力：

| 能力 | CUPS 属性 | 判断逻辑 |
|---|---|---|
| 彩色支持 | `printer-type` bitmask bit 3 (0x8) | `(parseInt(printerType) & 0x8) !== 0` |
| 彩色支持（备选）| `color-supported` | `!== 'false' && !== '0'` |
| 支持的纸张尺寸 | `media-supported`（空格分隔的 CUPS media ID 列表） | 映射 `iso_a4_210x297mm` → `A4` 等 |

CUPS 属性仅在 macOS / Linux 可用。Windows 打印机无此数据时，退回到标准纸张列表，并默认显示颜色选项。

---

## N-up 多页排版（每版打印页数）

`buildPreviewDoc.ts` 的 `buildNUpScript(pps)` 在 paged.js 渲染完成后注入一段内联 JS，将各 `.pagedjs_page` 元素重新排列为 2 列的 sheet 容器（CSS scale(0.5)），实现预览中的 2-up / 4-up 视觉效果。

物理打印时页数显示：`physicalSheets = ceil(totalPages / pagesPerSheet)`。

---

## pagedjs 源码内联说明

```typescript
import pagedJsRaw from '../../../node_modules/pagedjs/dist/paged.esm.js?raw'
```

- 相对路径绕过 pagedjs `package.json` 的 `exports` 字段限制
- `?raw` 由 **Vite 在构建时**处理，将文件内容嵌入 bundle 为字符串字面量
- 打包后的 Electron 应用不需要访问 `node_modules`，运行时无任何文件系统依赖，**不会出现打包问题**

---

## 获取打印机列表

```
Renderer: window.electronAPI.getPrinters()
    → IPC: 'get-printers'
    → Main: webContents.getPrintersAsync()
    → 返回 Electron.PrinterInfo[]（含 options / capabilities）
```

Handler 位于 `electron/WindowManager.ts`。默认选中系统默认打印机；若无打印机则默认选"另存为 PDF"。

---

## 已知问题与注意事项

1. **nextTick 必须**：`v-if="visible"` 根元素，`previewFrame` 在同一 tick 内为 `null`，所有渲染触发处均需 `await nextTick()`。

2. **Blob URL 传参**：通过 `URL.createObjectURL(blob)` 将整个 HTML 文档传给 iframe，避免 CSP 对内联脚本的限制。

3. **DOM 搬移打印**：打印时将 iframe 移到 `document.body` 顶层并 `position:fixed` 填满视口；`@media print` CSS 隐藏其余元素；`finally` 块保证恢复。

4. **printToPDF margins**：保存 PDF 时传 `marginType: 1`（none），让 paged.js 完全控制页面布局，避免 Chromium 额外添加边距。

5. **paged.js 全局样式累积**：多次重渲染会在 iframe 的 `<head>` 中累积 paged.js 注入的 `<style>`。通过重新设置 `iframe.src` 整个替换 iframe 内容解决。

6. **N-up 视觉与打印输出**：N-up 预览通过 CSS `scale(0.5)` 实现；实际打印输出依赖系统打印机的 N-up 支持，不经过 paged.js 处理。

---

## 后续扩展方向

| 功能 | 方案 |
|---|---|
| 更丰富的页眉/页脚 | paged.js `@page { @top-center / @bottom-right }` 支持自定义文本 |
| 多套打印样式 | 将样式提炼为独立 CSS，`generatePrintCSS()` 接收 styleId 参数 |
| 偶数/奇数页双面打印 | 奇偶页分别打印，配合打印机 duplex 设置 |
| 纸张尺寸持久化 | 存入 `StateStorage`，下次打开对话框恢复上次选择 |
| 非 Markdown 文档打印 | 其他文档类型（PDF、图片）目前走旧的 `appStore.handlePrint()` |
