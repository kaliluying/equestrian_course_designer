import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2015',
    minify: 'terser',
    cssMinify: true,
    cssCodeSplit: true,
    sourcemap: false,
    assetsInlineLimit: 4096,
    outDir: 'dist',
    emptyOutDir: true,
    terserOptions: {
      compress: {
        drop_console: false,
        drop_debugger: true,
        pure_funcs: [],
        passes: 2,
      },
      format: {
        comments: false,
      },
    },
    rollupOptions: {
      output: {
        entryFileNames: 'js/[name].js',
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
        chunkFileNames: 'js/[name].js',
        manualChunks: {
          vendor: ['vue', 'pinia'],
          'element-plus': ['element-plus'],
        },
      },
    },
  },
})
