import { existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

// Auto-scan pages directory
const pagesDir = resolve(__dirname, 'src/renderer/pages')
const pageDirs = existsSync(pagesDir)
  ? readdirSync(pagesDir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name)
  : []

const pageInputs = Object.fromEntries(
  pageDirs.map((dir) => [dir, resolve(__dirname, `src/renderer/pages/${dir}/index.html`)])
)

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          tabbar: resolve(__dirname, 'src/preload/tabbar.ts'),
          agent: resolve(__dirname, 'src/preload/agent.ts'),
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].js',
        },
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    build: {
      outDir: resolve(__dirname, 'out/renderer'),
      rollupOptions: {
        input: {
          tabbar: resolve(__dirname, 'src/renderer/tabbar/index.html'),
          ...pageInputs,
        },
      },
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': resolve(__dirname, './src/renderer'),
        '@types': resolve(__dirname, './src/types'),
      },
      dedupe: ['react', 'react-dom'],
    },
  },
})
