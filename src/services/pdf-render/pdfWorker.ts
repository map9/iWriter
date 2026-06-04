// 静态 import 保证 polyfill 在 pdfjs worker 代码之前求值，且 worker 同步初始化（无 await）。
import './pdfWorkerPolyfills'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import 'pdfjs-dist/build/pdf.worker.min.mjs'
