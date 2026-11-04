import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 产物由 Tauri 宿主经自定义资源协议加载：必须使用相对路径、全部依赖本地打包，不得产生外链。
export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // 与 tauri-host/tauri.conf.json 的 devUrl 保持一致。
  server: {
    port: 5173,
    strictPort: true,
    watch: { ignored: ['**/dist/**'] },
  },
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // WebView2 (Windows) 基于 Chromium；macOS 演进时使用 WKWebView。
    target: ['es2022', 'chrome111', 'safari16'],
    sourcemap: false,
  },
});
