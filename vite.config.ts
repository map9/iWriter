import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { resolve } from 'path'

const electronMainExternal = [
  'electron',
  '@langchain/langgraph-checkpoint-sqlite',
  'better-sqlite3',
]

function getVendorChunkName(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined

  if (id.includes('/highlight.js/')) return 'highlight'
  if (id.includes('/pdfjs-dist/')) return 'pdfjs'
  if (id.includes('/katex/')) return 'katex'
  if (id.includes('/@tiptap/') || id.includes('/prosemirror-')) return 'tiptap'
  if (id.includes('/vue/') || id.includes('/@vue/')) return 'vue'
  if (id.includes('/vue-router/')) return 'vue-router'
  if (id.includes('/pinia/')) return 'pinia'

  return 'vendor'
}

export default defineConfig({
  plugins: [
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
            sourcemap: true,
            minify: false,
            outDir: 'dist-electron',
            rollupOptions: {
              // Native addons like better-sqlite3 must stay in node_modules.
              // If Vite bundles them into dist-electron, bindings() resolves the
              // .node binary from the wrong module root and SqliteSaver falls
              // back to MemorySaver at runtime.
              external: electronMainExternal
            }
          }
        }
      },
      {
        entry: 'electron/preload.ts',
        vite: {
          build: {
            sourcemap: 'inline',
            minify: false,
            outDir: 'dist-electron',
            rollupOptions: {
              external: electronMainExternal
            }
          }
        }
      }
    ]),
    renderer()
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
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
    include: ["nanoid", "typo-js"],
  },
  build: {
    outDir: 'dist',
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
})
