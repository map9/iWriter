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
| `src/components/print/PrintDialog.vue` | Markdown / 图片打印对话框（预览 + 设置面板） |
| `src/components/print/HtmlPrintPreview.vue` | 自包含 HTML 文档的 iframe 预览 |
| `src/components/print/PdfPrintDialog.vue` | PDF 打印对话框 |
| `src/components/print/PdfPrintPreview.vue` | 使用 pdf.js 将 PDF 页面渲染到 canvas |
| `src/components/print/buildPreviewDoc.ts` | 构建 iframe 预览及隐藏窗口打印使用的自包含 HTML 文档 |
| `src/stores/app.ts` | 打印源、对话框状态及 `open*PrintPreview()` |
| `src/views/MainView.vue` | 注册 `<PrintDialog>` 和 `<PdfPrintDialog>` |
| `src/components/pages/` | 各文档页面通过 `handleMenuAction('print')` 打开对应打印对话框 |
| `electron/WindowManager.ts` | 隐藏窗口打印及 `get-printers`、`print-from-html`、`print-pdf-file`、`save-to-pdf-from-html` IPC handlers |
| `electron/preload.ts` | 暴露 `getPrinters()`、`printFromHtml()`、`printPdfFile()`、`saveToPdfFromHtml()` |
| `src/types/electron-api.ts` | `ElectronAPI` 接口对应类型声明 |

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
    ▼ MainView.vue 中的 <PrintDialog :visible="..." :html="...">
    │
    ▼ watch(props.visible) → buildPreviewHtml()
```

### paged.js 渲染流程（iframe 内部）

```
buildPreviewDocumentWithOptions(html, printCss, options)
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
    ▼ buildPreviewHtml() 生成自包含 HTML 文档
    │
    ▼ window.electronAPI.saveToPdfFromHtml(html, pdfOptions)
        → IPC: 'save-to-pdf-from-html'
        → 主进程: dialog.showSaveDialog() → 用户选择文件路径
        → renderInHiddenHtmlWindow() 加载临时 HTML
        → 隐藏窗口 webContents.printToPDF(options) → 写入文件
```

### 普通打印流程（独立隐藏窗口）

```
buildPreviewHtml() 生成自包含 HTML 文档
    │
    ▼ window.electronAPI.printFromHtml(html, printOptions)
    │
    ▼ IPC: 'print-from-html'
    │
    ▼ renderInHiddenHtmlWindow() 创建隐藏 BrowserWindow 并加载临时 HTML
    │
    ▼ hidden.webContents.print(printOptions)
```

主应用窗口不会进入打印模式，也不会调用 `window.print()`；因此打印样式不依赖全局 `src/style.css`。

### PDF 打印流程

```
PdfPrintPreview 使用 pdf.js 生成 canvas 预览
    │
    ▼ window.electronAPI.printPdfFile(filePath, printOptions)
    │
    ▼ IPC: 'print-pdf-file'
    │
    ▼ renderInHiddenPdfWindow() 使用 Chromium 内置 PDF Viewer 加载原文件
    │
    ▼ hidden.webContents.print(printOptions)
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

3. **隐藏窗口隔离**：正式打印和 PDF 导出都在临时隐藏窗口完成，主应用窗口及其全局样式不参与打印。

4. **printToPDF margins**：保存 PDF 时向 Chromium 传入四边为 `0` 的 margins，让 paged.js 完全控制页面布局，避免 Chromium 额外添加边距。

5. **paged.js 全局样式累积**：多次重渲染会在 iframe 的 `<head>` 中累积 paged.js 注入的 `<style>`。通过重新设置 `iframe.src` 整个替换 iframe 内容解决。

6. **N-up 视觉与打印输出**：paged.js 渲染完成后会将页面重排为 sheet；预览、打印和 PDF 导出复用同一份重排后的自包含 HTML。

---

## 后续扩展方向

| 功能 | 方案 |
|---|---|
| 更丰富的页眉/页脚 | paged.js `@page { @top-center / @bottom-right }` 支持自定义文本 |
| 多套打印样式 | 将样式提炼为独立 CSS，`generatePrintCSS()` 接收 styleId 参数 |
| 偶数/奇数页双面打印 | 奇偶页分别打印，配合打印机 duplex 设置 |
| 纸张尺寸持久化 | 存入 `StateStorage`，下次打开对话框恢复上次选择 |
