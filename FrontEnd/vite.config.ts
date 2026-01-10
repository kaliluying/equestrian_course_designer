import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import Icons from 'unplugin-icons/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { visualizer } from 'rollup-plugin-visualizer'
import viteCompression from 'vite-plugin-compression'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [
    vue(),
    Components({
      resolvers: [
        ElementPlusResolver(),
      ],
    }),
    Icons({
      compiler: 'vue3',
      autoInstall: true,
    }),
    viteCompression({
      algorithm: 'gzip',
      ext: '.gz',
      threshold: 10240,
    }),
    viteCompression({
      algorithm: 'brotliCompress',
      ext: '.br',
      threshold: 10240,
    }),
    visualizer({
      filename: 'dist/stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2020',
    minify: 'esbuild',
    cssMinify: true,
    cssCodeSplit: true,
    sourcemap: false,
    assetsInlineLimit: 4096,
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'js/[name]-[hash].js',
        chunkFileNames: 'js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name?.split('.') || []
          const ext = info[info.length - 1] || 'js'
          if (assetInfo.name && /\.(mp4|webm|ogg|mp3|wav|flac|aac)(\?.*)?$/i.test(assetInfo.name)) {
            return `media/[name].[ext]`
          } else if (
            assetInfo.name &&
            /\.(png|jpe?g|gif|svg|ico|webp)(\?.*)?$/i.test(assetInfo.name)
          ) {
            return `img/[name].[ext]`
          } else if (assetInfo.name && /\.(woff2?|eot|ttf|otf)(\?.*)?$/i.test(assetInfo.name)) {
            return `fonts/[name].[ext]`
          }
          return `${ext}/[name].[ext]`
        },
        manualChunks: {
          'vue-core': ['vue', 'pinia', 'vue-router'],
          'element-ui': ['element-plus'],
          'export-engine': ['html2canvas', 'jspdf'],
          'utils': ['axios', 'uuid'],
        },
      },
    },
  },
  optimizeDeps: {
    include: ['vue', 'vue-router', 'pinia', 'element-plus'],
    exclude: ['html2canvas', 'jspdf'],
  },
})
