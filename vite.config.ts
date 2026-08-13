import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { existsSync, readdirSync, rmSync } from 'fs'
import { join, resolve } from 'path'

const electronMainExternal = [
  'electron',
  'original-fs',
  // SqliteSaver is external and deserializes checkpoint messages through the
  // runtime copy of @langchain/core. Keep every core subpath external too, so
  // middleware schemas and replayed messages share the same class identity.
  '@langchain/core',
  '@langchain/langgraph-checkpoint-sqlite',
  'better-sqlite3',
  // @parcel/watcher is a native N-API module (file watching); must stay in
  // node_modules and load its platform prebuild at runtime, not be bundled.
  '@parcel/watcher',
  // jsdom is used only in the main process (HtmlFetcher.ts).
  // canvas is a native addon optionally required by jsdom — both must stay in
  // node_modules and not be bundled, matching the same rationale as better-sqlite3.
  'jsdom',
  'canvas',
  '@mozilla/readability',
]

function isElectronMainExternal(id: string): boolean {
  return electronMainExternal.some(packageName =>
    id === packageName || id.startsWith(`${packageName}/`)
  )
}

function getVendorChunkName(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined

  if (id.includes('/highlight.js/')) return 'highlight'
  if (id.includes('/pdfjs-dist/')) return 'pdfjs'
  if (id.includes('/katex/')) return 'katex'
  if (id.includes('/@tiptap/') || id.includes('/prosemirror-')) return 'tiptap'
  if (id.includes('/vue/') || id.includes('/@vue/')) return 'vue'
  if (id.includes('/vue-router/')) return 'vue-router'
  if (id.includes('/pinia/')) return 'pinia'
  // 重但懒的库单独拆 chunk，配合页面懒加载避免混入首屏 vendor
  if (id.includes('/marked/') || id.includes('/turndown') || id.includes('/turndown-plugin-gfm')) return 'markdown-convert'
  if (id.includes('/lowlight/') || id.includes('/fault/') || id.includes('/highlight.js/')) return 'highlight'
  if (id.includes('/pagedjs/')) return 'pagedjs-lib'

  return 'vendor'
}

function removeFilesNamed(root: string, fileName: string): void {
  if (!existsSync(root)) return

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const entryPath = join(root, entry.name)
    if (entry.isDirectory()) {
      removeFilesNamed(entryPath, fileName)
    } else if (entry.name === fileName) {
      rmSync(entryPath, { force: true })
    }
  }
}

function pruneProductionArtifactsPlugin() {
  return {
    name: 'prune-production-artifacts',
    apply: 'build' as const,
    closeBundle() {
      removeFilesNamed('dist', '.DS_Store')
      removeFilesNamed('dist-electron', '.DS_Store')
      rmSync('dist/dictionaries/en/readme.md', { force: true })
      rmSync('dist/dictionaries/en/package.json', { force: true })
    },
  }
}

export default defineConfig(({ command }) => {
  const isProductionBuild = command === 'build'

  return {
    server: {
      port: 57173,
    },
    plugins: [
      tailwindcss(),
      vue(),
      electron([
        {
          entry: 'electron/main.ts',
          onstart(options) {
            if (options.startup) {
              options.startup()
            } else {
              options.reload()
            }
          },
          vite: {
            build: {
              sourcemap: isProductionBuild ? false : true,
              minify: isProductionBuild ? true : false,
              outDir: 'dist-electron',
              rollupOptions: {
                // Native addons like better-sqlite3 must stay in node_modules.
                // If Vite bundles them into dist-electron, bindings() resolves the
                // .node binary from the wrong module root and SqliteSaver falls
                // back to MemorySaver at runtime.
                external: isElectronMainExternal
              }
            }
          }
        },
        {
          entry: 'electron/preload.ts',
          vite: {
            build: {
              sourcemap: isProductionBuild ? false : 'inline',
              minify: isProductionBuild ? true : false,
              outDir: 'dist-electron',
              rollupOptions: {
                external: isElectronMainExternal
              }
            }
          }
        }
      ]),
      renderer(),
      pruneProductionArtifactsPlugin()
    ],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@shared': resolve(__dirname, 'shared'),
      }
    },
    css: {
      preprocessorOptions: {
        scss: {
          // 解决Sass弃用警告
          // implementation: sass, // Removed because it's not supported by Vite
        },
      },
    },
    optimizeDeps: {
      // PDFViewerPage 是懒加载页面，首次打开时会同时发现 pdfjs 主入口、viewer
      // 和自定义 worker 引入的 worker 入口。必须全部预打包，否则 Vite 会在
      // 运行中重新优化依赖并整页 reload（含 Explorer 和所有已打开标签页）。
      include: [
        "nanoid",
        "typo-js",
        "pdfjs-dist",
        "pdfjs-dist/web/pdf_viewer.mjs",
        "pdfjs-dist/build/pdf.worker.min.mjs",
      ],
    },
    build: {
      outDir: 'dist',
      // Electron 内置 Chromium 版本已知，esnext 减少不必要的语法降级与 polyfill
      target: 'esnext',
      rollupOptions: {
        output: {
          manualChunks(id) {
            return getVendorChunkName(id)
          },
          chunkFileNames: 'assets/js/[name]-[hash].js',
          entryFileNames: 'assets/js/[name]-[hash].js',
          assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
        },
      },
      // 调整警告阈值（从500KB提高到1000KB）
      chunkSizeWarningLimit: 1000,
    },
    worker: {
      format: 'es' // Specify ES module format for workers
    },
  }
})
